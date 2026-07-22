import sqlite3
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

DB_PATH = r'D:\hr-cnhy-evaluation\hr_eval.db'

app = FastAPI(title='충남한양 360 인사평가 D드라이브 로컬 API 서버')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        dept TEXT NOT NULL,
        workplace TEXT NOT NULL,
        role TEXT NOT NULL,
        type TEXT NOT NULL,
        sysRole TEXT NOT NULL,
        joindate TEXT,
        phone TEXT,
        company TEXT NOT NULL,
        raw_score REAL DEFAULT 85.0,
        final_score REAL DEFAULT 85.0,
        is_adjusted INTEGER DEFAULT 0,
        final_grade TEXT DEFAULT 'A'
    )
    ''')

    cursor.execute('SELECT COUNT(*) FROM users')
    if cursor.fetchone()[0] == 0:
        default_users = [
            ('홍길동', 'hong@hanyang.com', '경리', '본사', '과장', '팀원급', '일반사용자', '2020-03-01', '010-1111-2222', '한양고속', 91.5, 91.5, 0, 'S'),
            ('이순신', 'lee@chungnam.com', '안전관리', '본사', '차장', '팀장급', '일반사용자', '2018-05-15', '010-2222-3333', '충남고속', 88.0, 88.0, 0, 'A'),
            ('강감찬', 'kang@hanyang.com', '사업', '본사', '부장', '부서실장급', '일반사용자', '2015-01-10', '010-3333-4444', '한양고속', 100.0, 100.0, 1, 'EX'),
            ('유종열', 'jongyeol@hanyang.com', '인사총무', '본사', '대리', '팀원급', '관리자', '2021-09-01', '010-4444-5555', '한양고속', 95.0, 95.0, 0, 'S'),
            ('김유신', 'kim@chungnam.com', '차량', '아산영업소', '팀장', '팀장급', '일반사용자', '2017-11-20', '010-5555-6666', '충남고속', 82.4, 82.4, 0, 'B')
        ]
        cursor.executemany('''
        INSERT INTO users (name, email, dept, workplace, role, type, sysRole, joindate, phone, company, raw_score, final_score, is_adjusted, final_grade)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', default_users)
    
    conn.commit()
    conn.close()

init_db()

class UserCreate(BaseModel):
    name: str
    email: str
    dept: str
    workplace: str
    role: str
    type: str
    sysRole: str
    joindate: Optional[str] = None
    phone: Optional[str] = None
    company: str

@app.get('/')
def read_root():
    return {'message': '충남한양 360 인사평가 D드라이브 로컬 DB 백엔드 정상 가동 중!', 'db_location': DB_PATH}

@app.get('/api/users')
def get_users():
    conn = get_db()
    users = conn.execute('SELECT * FROM users').fetchall()
    conn.close()
    return [dict(u) for u in users]

@app.post('/api/users')
def create_user(user: UserCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
        INSERT INTO users (name, email, dept, workplace, role, type, sysRole, joindate, phone, company)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user.name, user.email, user.dept, user.workplace, user.role, user.type, user.sysRole, user.joindate, user.phone, user.company))
        conn.commit()
        new_id = cursor.lastrowid
        conn.close()
        return {'status': 'success', 'id': new_id, 'message': f'사용자 [{user.name}] 님이 D드라이브 DB에 저장되었습니다.'}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
