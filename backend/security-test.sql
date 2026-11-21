-- Execute as postgres after schema.sql. Synthetic fixtures and all records roll back.
-- Inspect existing auth.users triggers before running on a shared project.
begin;
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous) values
 ('77000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tabby-test-a@example.invalid',now(),'{}','{}',now(),now(),false),
 ('77000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tabby-test-b@example.invalid',now(),'{}','{}',now(),now(),false),
 ('77000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tabby-test-c@example.invalid',now(),'{}','{}',now(),now(),false),
 ('77000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tabby-test-unverified@example.invalid',null,'{}','{}',now(),now(),false);
insert into public.tabby_circles(id,name,owner_id) values
 ('77100000-0000-4000-8000-000000000001','Test family','77000000-0000-4000-8000-000000000001'),
 ('77100000-0000-4000-8000-000000000002','Test private','77000000-0000-4000-8000-000000000003');
insert into public.tabby_members(id,circle_id,name,user_id) values
 ('77200000-0000-4000-8000-000000000001','77100000-0000-4000-8000-000000000001','A','77000000-0000-4000-8000-000000000001'),
 ('77200000-0000-4000-8000-000000000002','77100000-0000-4000-8000-000000000001','B',null),
 ('77200000-0000-4000-8000-000000000003','77100000-0000-4000-8000-000000000002','C','77000000-0000-4000-8000-000000000003'),
 ('77200000-0000-4000-8000-000000000004','77100000-0000-4000-8000-000000000001','Unverified','77000000-0000-4000-8000-000000000004');

set local role anon;
do $$ declare denied boolean:=false; begin
 begin perform * from public.tabby_circles; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL anonymous table access'; end if;
 denied:=false;
 begin perform public.tabby_command('create_circle','{}'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL anonymous RPC access'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"77000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.tabby_circles)<>1 then raise exception 'FAIL circle privacy'; end if;
 if exists(select 1 from public.tabby_members where circle_id='77100000-0000-4000-8000-000000000001') then raise exception 'FAIL member privacy'; end if;
 begin perform public.tabby_command('add_person','{"circleId":"77100000-0000-4000-8000-000000000001","name":"intruder"}'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL cross circle write'; end if;
 denied:=false;
 begin insert into public.tabby_members(circle_id,name,user_id) values('77100000-0000-4000-8000-000000000001','Intruder',auth.uid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL forged membership'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"77000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.tabby_command('create_invite','{"circleId":"77100000-0000-4000-8000-000000000001","personId":"77200000-0000-4000-8000-000000000002","tokenHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}');
select set_config('request.jwt.claims','{"sub":"77000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.tabby_command('accept_invite','{"tokenHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}');
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.tabby_circles)<>1 then raise exception 'FAIL invited membership'; end if;
 begin perform public.tabby_command('accept_invite','{"tokenHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'); exception when others then denied:=true; end;
 if not denied then raise exception 'FAIL invite replay'; end if;
 denied:=false;
 begin perform * from public.tabby_invites; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL invite hash disclosure'; end if;
end $$;

select public.tabby_command('add_entry','{"id":"77300000-0000-4000-8000-000000000001","circleId":"77100000-0000-4000-8000-000000000001","kind":"payment","title":"Paid A","amount":5000,"payerId":"77200000-0000-4000-8000-000000000002","recipientId":"77200000-0000-4000-8000-000000000001","date":"2026-11-21"}');
do $$ declare denied boolean:=false; begin
 if not exists(select 1 from public.tabby_entries where id='77300000-0000-4000-8000-000000000001' and status='pending') then raise exception 'FAIL pending payment'; end if;
 begin perform public.tabby_command('confirm_payment','{"id":"77300000-0000-4000-8000-000000000001"}'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL sender self confirmation'; end if;
 denied:=false;
 begin update public.tabby_entries set status='confirmed' where id='77300000-0000-4000-8000-000000000001'; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL direct financial update'; end if;
 denied:=false;
 begin perform public.tabby_command('add_entry','{"circleId":"77100000-0000-4000-8000-000000000001","kind":"payment","title":"Forged","amount":5000,"payerId":"77200000-0000-4000-8000-000000000001","recipientId":"77200000-0000-4000-8000-000000000002","date":"2026-11-21"}'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL forged payment sender'; end if;
 denied:=false;
 begin perform public.tabby_command('add_entry','{"circleId":"77100000-0000-4000-8000-000000000001","kind":"expense","title":"Forged split","amount":5000,"payerId":"77200000-0000-4000-8000-000000000002","shares":[{"personId":"77200000-0000-4000-8000-000000000003","amount":5000}],"date":"2026-11-21"}'); exception when others then denied:=true; end;
 if not denied then raise exception 'FAIL cross circle split'; end if;
 denied:=false;
 begin perform public.tabby_command('add_entry','{"circleId":"77100000-0000-4000-8000-000000000001","kind":"expense","title":"Missing share","amount":5000,"payerId":"77200000-0000-4000-8000-000000000002","shares":[{"personId":"77200000-0000-4000-8000-000000000001"}],"date":"2026-11-21"}'); exception when others then denied:=true; end;
 if not denied then raise exception 'FAIL missing share amount'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"77000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.tabby_command('confirm_payment','{"id":"77300000-0000-4000-8000-000000000001"}');
do $$ begin
 if not exists(select 1 from public.tabby_entries where id='77300000-0000-4000-8000-000000000001' and status='confirmed' and confirmed_by=auth.uid()) then raise exception 'FAIL recipient confirmation'; end if;
end $$;
select public.tabby_command('add_entry','{"id":"77300000-0000-4000-8000-000000000002","circleId":"77100000-0000-4000-8000-000000000001","kind":"expense","title":"Phone","amount":5000,"payerId":"77200000-0000-4000-8000-000000000001","shares":[{"personId":"77200000-0000-4000-8000-000000000002","amount":5000}],"date":"2026-11-21","recurrenceKey":"77400000-0000-4000-8000-000000000001:2026-11-21"}');
do $$ declare denied boolean:=false; begin
 begin perform public.tabby_command('add_entry','{"circleId":"77100000-0000-4000-8000-000000000001","kind":"expense","title":"Phone duplicate","amount":5000,"payerId":"77200000-0000-4000-8000-000000000001","shares":[{"personId":"77200000-0000-4000-8000-000000000002","amount":5000}],"date":"2026-11-21","recurrenceKey":"77400000-0000-4000-8000-000000000001:2026-11-21"}'); exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'FAIL duplicate recurrence'; end if;
 if (select count(*) from public.tabby_audit where action='confirm_payment')<>1 then raise exception 'FAIL audit log'; end if;
end $$;

select public.tabby_command('void_entry','{"id":"77300000-0000-4000-8000-000000000002","reason":"test correction"}');
do $$ begin
 if not exists(select 1 from public.tabby_entries where id='77300000-0000-4000-8000-000000000002' and status='void') then raise exception 'FAIL void preserves history'; end if;
 if not exists(select 1 from public.tabby_audit where record_id='77300000-0000-4000-8000-000000000002' and action='void_entry' and detail->>'reason'='test correction') then raise exception 'FAIL void audit reason'; end if;
end $$;

-- A corrected occurrence may retain its anchor while changing the actual paid date.
select public.tabby_command('add_entry','{"id":"77300000-0000-4000-8000-000000000003","circleId":"77100000-0000-4000-8000-000000000001","kind":"expense","title":"Phone corrected","amount":5100,"payerId":"77200000-0000-4000-8000-000000000001","shares":[{"personId":"77200000-0000-4000-8000-000000000002","amount":5100}],"date":"2026-11-22","recurrenceKey":"77400000-0000-4000-8000-000000000001:2026-11-21"}');
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.tabby_entries where recurrence_key='77400000-0000-4000-8000-000000000001:2026-11-21')<>2 then raise exception 'FAIL corrected recurrence preserves original'; end if;
 if (select count(*) from public.tabby_entries where recurrence_key='77400000-0000-4000-8000-000000000001:2026-11-21' and status<>'void')<>1 then raise exception 'FAIL exactly one active corrected occurrence'; end if;
 begin perform public.tabby_command('add_entry','{"circleId":"77100000-0000-4000-8000-000000000001","kind":"expense","title":"Corrected duplicate","amount":5100,"payerId":"77200000-0000-4000-8000-000000000001","shares":[{"personId":"77200000-0000-4000-8000-000000000002","amount":5100}],"date":"2026-11-23","recurrenceKey":"77400000-0000-4000-8000-000000000001:2026-11-21"}'); exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'FAIL duplicate corrected occurrence'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"77000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare denied boolean:=false; begin
 if exists(select 1 from public.tabby_circles) then raise exception 'FAIL unverified reads'; end if;
 begin perform public.tabby_command('create_circle','{"name":"Unverified","personName":"No"}'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL unverified mutation'; end if;
end $$;
reset role;
select 'PASS: privacy, forged writes, single-use invites, receiver confirmation, immutable audit, recurrence dedupe and corrections, verified accounts' as security_test_result;
rollback;

-- Explicitly verify the transactional fixtures did not survive rollback.
do $$ begin
 if exists(select 1 from auth.users where id in ('77000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000003','77000000-0000-4000-8000-000000000004')) then raise exception 'FAIL auth fixture leak'; end if;
 if exists(select 1 from public.tabby_circles where id in ('77100000-0000-4000-8000-000000000001','77100000-0000-4000-8000-000000000002')) then raise exception 'FAIL circle fixture leak'; end if;
end $$;
select 'PASS: synthetic auth and circle fixtures rolled back' as fixture_cleanup_result;
