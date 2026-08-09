begin;

do $$
declare
  v_function regprocedure := 'public.submit_evaluation_central(bigint,numeric,numeric,numeric,numeric,text,jsonb)'::regprocedure;
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(v_function) into v_definition;
  v_updated := replace(
    replace(v_definition,
      $pattern$length(trim(coalesce(p_comment, ''))) < 50$pattern$,
      $pattern$length(trim(coalesce(p_comment, ''))) < 10$pattern$),
    'Comment must contain at least 50 characters',
    'Comment must contain at least 10 characters'
  );
  if v_updated = v_definition then
    raise exception 'submit_evaluation_central comment validation was not found';
  end if;
  execute v_updated;
end $$;

commit;
