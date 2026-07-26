begin;

alter table public.evaluation_questions
  alter column weight set default 1;

create or replace function public.enforce_equal_question_weight()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  new.weight := 1;
  return new;
end
$$;

drop trigger if exists trg_enforce_equal_question_weight on public.evaluation_questions;
create trigger trg_enforce_equal_question_weight
before insert or update of weight on public.evaluation_questions
for each row execute function public.enforce_equal_question_weight();

revoke all on function public.enforce_equal_question_weight() from public;

commit;
