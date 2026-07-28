import crypto from 'node:crypto';

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function firebaseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value?.client_email && value?.private_key && value?.project_id ? value : null;
  } catch (error) {
    console.warn('Firebase service account JSON is invalid:', error.message);
    return null;
  }
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function firebaseAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessTokenExpiresAt > now + 60) return cachedAccessToken;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Firebase OAuth failed.');
  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt = now + Number(payload.expires_in || 3600);
  return cachedAccessToken;
}

async function sendFirebaseMessage(account, accessToken, token, notification) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: notification.title, body: notification.message },
        data: {
          notification_id: String(notification.id),
          cycle_id: String(notification.cycle_id || ''),
          view: String(notification.target_view || 'list'),
          subtab: String(notification.target_subtab || '')
        },
        android: {
          priority: 'high',
          notification: { channel_id: 'cnhyex_hr_updates', sound: 'default' }
        }
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `FCM HTTP ${response.status}`);
}

export async function createNotifications(service, {
  eventKey, cycleId, type, title, message, recipientUserIds, targetView = 'list', targetSubtab = null
}) {
  const recipients = [...new Set((recipientUserIds || []).map(Number).filter(Number.isInteger))];
  if (!eventKey || !recipients.length) return [];
  const rows = recipients.map(recipientUserId => ({
    recipient_user_id: recipientUserId,
    cycle_id: cycleId || null,
    notification_type: type,
    title,
    message,
    event_key: eventKey,
    target_view: targetView,
    target_subtab: targetSubtab
  }));
  const inserted = await service.from('evaluation_notifications')
    .upsert(rows, { onConflict: 'recipient_user_id,event_key', ignoreDuplicates: true })
    .select('id');
  if (inserted.error) throw inserted.error;
  const all = await service.from('evaluation_notifications')
    .select('id')
    .eq('event_key', eventKey)
    .in('recipient_user_id', recipients);
  if (all.error) throw all.error;
  return (all.data || []).map(row => Number(row.id));
}

export async function dispatchPushNotifications(service, notificationIds) {
  const account = firebaseServiceAccount();
  if (!account || !notificationIds?.length) return { configured: Boolean(account), sent: 0 };
  try {
    const claimed = await service.rpc('claim_push_notifications', {
      p_notification_ids: [...new Set(notificationIds.map(Number).filter(Number.isInteger))]
    });
    if (claimed.error) throw claimed.error;
    const notifications = claimed.data || [];
    if (!notifications.length) return { configured: true, sent: 0 };
    const userIds = [...new Set(notifications.map(row => Number(row.recipient_user_id)))];
    const tokenResult = await service.from('push_device_tokens')
      .select('user_id,token')
      .in('user_id', userIds)
      .eq('active', true);
    if (tokenResult.error) throw tokenResult.error;
    const tokensByUser = new Map();
    for (const row of tokenResult.data || []) {
      const id = Number(row.user_id);
      if (!tokensByUser.has(id)) tokensByUser.set(id, []);
      tokensByUser.get(id).push(row.token);
    }
    const accessToken = await firebaseAccessToken(account);
    let sent = 0;
    for (const notification of notifications) {
      const tokens = tokensByUser.get(Number(notification.recipient_user_id)) || [];
      let success = 0;
      let lastError = null;
      for (const token of tokens) {
        try {
          await sendFirebaseMessage(account, accessToken, token, notification);
          success += 1;
        } catch (error) {
          lastError = error;
        }
      }
      const status = tokens.length === 0 ? 'skipped' : success > 0 ? 'sent' : 'failed';
      const update = await service.from('evaluation_notifications').update({
        push_status: status,
        push_sent_at: success > 0 ? new Date().toISOString() : null,
        push_error: lastError?.message || (tokens.length ? null : 'No registered Android device token')
      }).eq('id', notification.id).eq('push_status', 'sending');
      if (update.error) console.warn('Unable to update push delivery status:', update.error.message);
      sent += success > 0 ? 1 : 0;
    }
    return { configured: true, sent };
  } catch (error) {
    console.warn('Push dispatch failed without blocking the business action:', error.message);
    return { configured: true, sent: 0, error: error.message };
  }
}

export async function notifyAndDispatch(service, spec) {
  try {
    const ids = await createNotifications(service, spec);
    return await dispatchPushNotifications(service, ids);
  } catch (error) {
    console.warn('Notification creation failed without blocking the business action:', error.message);
    return { configured: Boolean(firebaseServiceAccount()), sent: 0, error: error.message };
  }
}
