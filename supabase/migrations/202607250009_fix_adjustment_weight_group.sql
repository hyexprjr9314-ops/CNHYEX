begin;

do $$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef(
    'public.governance_adjust_final_score(bigint,bigint,numeric,text,uuid)'::regprocedure
  ) into v_definition;
  v_original := v_definition;

  v_definition := regexp_replace(
    v_definition,
    E'and target\\.is_evaluatee is not false;[[:space:]]+if v_raw_score is null then',
    E'and target.is_evaluatee is not false\n  group by s.track_category_weights, s.performance_weight, s.collaboration_weight,\n    s.growth_weight, s.harmony_weight;\n  if v_raw_score is null then'
  );

  if v_definition = v_original then
    raise exception 'Unable to locate the final adjustment score aggregation';
  end if;
  execute v_definition;
end $$;

commit;
