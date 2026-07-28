begin;

-- Relative grades are a frozen first assessment based only on raw scores.
-- Later score/grade adjustments affect only the selected employee through
-- effective_score and approved_grade; they never rerank innocent peers.
create or replace function public.apply_exceptional_grade_policy()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.internal_approval_status <> 'requested'
     or old.internal_approval_status is not distinct from new.internal_approval_status then
    return new;
  end if;

  update public.evaluation_final_results r
  set relative_grade = 'EX'
  where r.cycle_id = new.id and r.result_version = new.result_version
    and r.raw_score = 100;

  with cohort_sizes as (
    select cohort_key,count(*)::integer member_count
    from public.evaluation_final_results
    where cycle_id=new.id and result_version=new.result_version and relative_grade <> 'EX'
    group by cohort_key
  ), base as (
    select c.cohort_key,c.member_count,v.grade,v.ratio,v.grade_order,
      floor(c.member_count*v.ratio)::integer base_count,
      c.member_count*v.ratio-floor(c.member_count*v.ratio) remainder
    from cohort_sizes c cross join (values
      ('S',0.05::numeric,1),('A',0.20::numeric,2),('B',0.60::numeric,3),
      ('C',0.10::numeric,4),('D',0.05::numeric,5)
    ) v(grade,ratio,grade_order)
  ), remainder_allocated as (
    select b.*,b.member_count-sum(b.base_count) over(partition by b.cohort_key) remaining,
      row_number() over(partition by b.cohort_key order by b.remainder desc,b.grade_order) remainder_rank
    from base b
  ), initial_counts as (
    select *,base_count+case when remainder_rank<=remaining then 1 else 0 end allocation_count
    from remainder_allocated
  ), guaranteed as (
    select *,case
      when member_count>=10 and grade in ('S','D') and allocation_count=0 then 1
      when member_count>=10 and grade='B' then allocation_count
        - (select count(*) from initial_counts x
           where x.cohort_key=initial_counts.cohort_key
             and x.grade in ('S','D') and x.allocation_count=0)
      else allocation_count end final_count
    from initial_counts
  ), ranked as (
    select r.target_id,r.cohort_key,row_number() over(
      partition by r.cohort_key order by r.raw_score desc,r.target_id
    ) score_rank
    from public.evaluation_final_results r
    where r.cycle_id=new.id and r.result_version=new.result_version and r.relative_grade <> 'EX'
  ), grade_ranges as (
    select g.*,coalesce(sum(g.final_count) over(
      partition by g.cohort_key order by g.grade_order rows between unbounded preceding and 1 preceding
    ),0)+1 first_rank,
    sum(g.final_count) over(partition by g.cohort_key order by g.grade_order) last_rank
    from guaranteed g
  )
  update public.evaluation_final_results r
  set relative_grade=g.grade
  from ranked k join grade_ranges g
    on g.cohort_key=k.cohort_key and k.score_rank between g.first_rank and g.last_rank
  where r.cycle_id=new.id and r.result_version=new.result_version and r.target_id=k.target_id;

  update public.evaluation_final_results r
  set approved_grade=coalesce((
    select a.grade_override from public.evaluation_result_adjustments a
    where a.cycle_id=r.cycle_id and a.target_id=r.target_id and a.status='active'
  ),r.relative_grade)
  where r.cycle_id=new.id and r.result_version=new.result_version;

  update public.evaluation_result_adjustments a
  set final_grade=r.approved_grade,updated_at=now()
  from public.evaluation_final_results r
  where a.cycle_id=new.id and a.status='active'
    and r.cycle_id=new.id and r.result_version=new.result_version and r.target_id=a.target_id;

  update public.evaluation_grade_allocations a
  set allocation_count=(
    select count(*) from public.evaluation_final_results r
    where r.cycle_id=new.id and r.result_version=new.result_version
      and r.cohort_key=a.cohort_key and r.relative_grade=a.grade
  ),allocated_at=now()
  where a.cycle_id=new.id;

  update public.evaluation_archives archive
  set snapshot=(
    select jsonb_agg(
      case when result.target_id is null then item
        else item || jsonb_build_object(
          'raw_score',result.raw_score,
          'score',result.effective_score,
          'grade',coalesce(result.approved_grade,result.relative_grade)
        )
      end order by ordinal
    )
    from jsonb_array_elements(archive.snapshot) with ordinality snapshot(item,ordinal)
    left join public.evaluation_final_results result
      on result.cycle_id=archive.cycle_id
     and result.result_version=new.result_version
     and result.target_id=(snapshot.item->>'id')::bigint
  )
  where archive.cycle_id=new.id;

  return new;
end $$;

commit;
