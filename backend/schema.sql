-- Tabby: isolated tables, immutable financial history, private circles.
-- Install once through the Supabase SQL editor or migration tool as postgres.
-- This file never alters existing applications' tables, auth settings or data.
begin;
create schema if not exists tabby_private;
revoke all on schema tabby_private from public, anon;
grant usage on schema tabby_private to authenticated;

create table public.tabby_circles (
 id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 80),
 emoji text not null default '🏡' check(length(emoji)<=20), owner_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.tabby_members (
 id uuid primary key default gen_random_uuid(), circle_id uuid not null references public.tabby_circles(id),
 name text not null check(length(btrim(name)) between 1 and 60), color text not null default '#E9D8FD' check(length(color)<=30),
 user_id uuid references auth.users(id), created_at timestamptz not null default now(), unique(circle_id,user_id)
);
create index tabby_members_user_idx on public.tabby_members(user_id,circle_id);
create index tabby_members_circle_idx on public.tabby_members(circle_id);
create table public.tabby_entries (
 id uuid primary key default gen_random_uuid(), circle_id uuid not null references public.tabby_circles(id),
 kind text not null check(kind in ('expense','payment')), title text not null check(length(btrim(title)) between 1 and 120),
 amount integer not null check(amount between 1 and 100000000), payer_id uuid not null references public.tabby_members(id),
 recipient_id uuid references public.tabby_members(id), shares jsonb not null default '[]'::jsonb check(jsonb_typeof(shares)='array'),
 date date not null check(date between date '1900-01-01' and date '2200-12-31'), vendor text check(length(vendor)<=120), category text check(length(category)<=60), note text check(length(note)<=2000),
 status text not null check(status in ('confirmed','pending','void')), created_by uuid not null references auth.users(id),
 confirmed_by uuid references auth.users(id), created_at timestamptz not null default now(),
 recurrence_key text check(length(recurrence_key)<=80),
 check((kind='expense' and recipient_id is null) or (kind='payment' and recipient_id is not null and payer_id<>recipient_id))
);
-- Voiding an occurrence permits a corrected posting while retaining its history.
create unique index tabby_entries_active_recurrence_idx on public.tabby_entries(circle_id,recurrence_key) where status<>'void';
create index tabby_entries_circle_date_idx on public.tabby_entries(circle_id,date desc);
create index tabby_entries_payer_idx on public.tabby_entries(payer_id);
create index tabby_entries_recipient_idx on public.tabby_entries(recipient_id);
create table public.tabby_recurring (
 id uuid primary key default gen_random_uuid(), circle_id uuid not null references public.tabby_circles(id),
 title text not null check(length(btrim(title)) between 1 and 120), amount integer not null check(amount between 1 and 100000000),
 payer_id uuid not null references public.tabby_members(id), shares jsonb not null check(jsonb_typeof(shares)='array'),
 day_of_month integer not null check(day_of_month between 1 and 31), next_date date not null check(next_date between date '1900-01-01' and date '2200-12-31'),
 vendor text check(length(vendor)<=120), category text check(length(category)<=60), note text check(length(note)<=2000),
 active boolean not null default true, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index tabby_recurring_circle_idx on public.tabby_recurring(circle_id);
create table public.tabby_invites (
 id uuid primary key default gen_random_uuid(), circle_id uuid not null references public.tabby_circles(id),
 person_id uuid not null references public.tabby_members(id), token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references auth.users(id), accepted_at timestamptz, revoked boolean not null default false
);
create index tabby_invites_circle_idx on public.tabby_invites(circle_id);
create index tabby_invites_person_idx on public.tabby_invites(person_id);
create table public.tabby_audit (
 id bigint generated always as identity primary key, circle_id uuid not null references public.tabby_circles(id),
 actor_id uuid not null references auth.users(id), action text not null, record_id uuid, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index tabby_audit_circle_idx on public.tabby_audit(circle_id,created_at);

-- Authorization data comes only from auth.users and the protected membership table.
create function tabby_private.require_user() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then
   raise exception 'Please sign in with a verified email account.' using errcode='42501';
 end if;
 return u;
end $$;
create function tabby_private.is_member(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.tabby_members m join auth.users u on u.id=m.user_id where m.circle_id=c and m.user_id=auth.uid() and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false));
$$;
create function tabby_private.validate_shares(c uuid, a integer, s jsonb) returns void language plpgsql security definer set search_path='' as $$
declare x jsonb; n integer:=0; total bigint:=0; seen uuid[]:='{}'; p uuid; v integer;
begin
 if a is null or a<1 or a>100000000 or jsonb_typeof(s)<>'array' or jsonb_array_length(s)<1 or jsonb_array_length(s)>100 then raise exception 'Enter an amount and at least one share.'; end if;
 for x in select value from jsonb_array_elements(s) loop
   p:=(x->>'personId')::uuid;
   if x->>'amount' is null or (x->>'amount') !~ '^[0-9]+$' then raise exception 'Shares must be whole cents.'; end if;
   v:=(x->>'amount')::integer;
   if p is null or p=any(seen) or not exists(select 1 from public.tabby_members where id=p and circle_id=c) then raise exception 'Shares must refer to unique people in this circle.'; end if;
   total:=total+v; seen:=array_append(seen,p); n:=n+1;
 end loop;
 if total<>a then raise exception 'Shares must add up to the expense total.'; end if;
end $$;

-- One audited mutation boundary. Public wrapper is SECURITY INVOKER; privileged
-- implementation is in a non-exposed schema and checks authorization for every op.
create function tabby_private.command(op text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=tabby_private.require_user(); c uuid; r uuid; member_id uuid; recipient uuid; payer uuid;
 e public.tabby_entries; inv public.tabby_invites; rec public.tabby_recurring; owns boolean; a integer; s jsonb; h text;
begin
 if op='create_circle' then
   insert into public.tabby_circles(name,emoji,owner_id) values(btrim(p->>'name'),coalesce(p->>'emoji','🏡'),u) returning id into c;
   insert into public.tabby_members(circle_id,name,user_id,color) values(c,btrim(p->>'personName'),u,'#D9E9DD') returning id into member_id;
   insert into public.tabby_audit(circle_id,actor_id,action,record_id) values(c,u,'circle_created',c);
   return jsonb_build_object('id',c,'personId',member_id);
 end if;
 if op='accept_invite' then
   h:=p->>'tokenHash';
   select * into inv from public.tabby_invites where token_hash=h for update;
   if not found or inv.revoked or inv.accepted_at is not null or inv.expires_at<=now() then raise exception 'This invitation is invalid, expired, or already used.'; end if;
   c:=inv.circle_id;
   if exists(select 1 from public.tabby_members where circle_id=c and user_id=u) then raise exception 'You already belong to this circle.'; end if;
   update public.tabby_members set user_id=u where id=inv.person_id and circle_id=c and user_id is null returning id into member_id;
   if not found then raise exception 'This person has already joined. Ask for a new invitation.'; end if;
   update public.tabby_invites set accepted_by=u,accepted_at=now() where id=inv.id;
   update public.tabby_invites set revoked=true where person_id=inv.person_id and id<>inv.id;
   insert into public.tabby_audit(circle_id,actor_id,action,record_id) values(c,u,'invite_accepted',member_id);
   return jsonb_build_object('id',c,'personId',member_id);
 end if;
 if op in ('confirm_payment','void_entry') then
   select * into e from public.tabby_entries where id=(p->>'id')::uuid for update;
   if not found then raise exception 'Record not found.'; end if;
   c:=e.circle_id;
 elsif op='toggle_recurring' then
   select * into rec from public.tabby_recurring where id=(p->>'id')::uuid for update;
   if not found then raise exception 'Recurring bill not found.'; end if;
   c:=rec.circle_id;
 else c:=(p->>'circleId')::uuid;
 end if;
 if c is null or not tabby_private.is_member(c) then raise exception 'You do not have access to this circle.' using errcode='42501'; end if;
 select owner_id=u into owns from public.tabby_circles where id=c;
 select id into member_id from public.tabby_members where circle_id=c and user_id=u;

 if op='add_person' then
   if not owns then raise exception 'Only the circle owner can add people.' using errcode='42501'; end if;
   if (select count(*) from public.tabby_members where circle_id=c)>=100 then raise exception 'A circle supports up to 100 people.'; end if;
   insert into public.tabby_members(circle_id,name,color) values(c,btrim(p->>'name'),coalesce(p->>'color','#E9D8FD')) returning id into r;
 elsif op='create_invite' then
   if not owns then raise exception 'Only the circle owner can invite people.' using errcode='42501'; end if;
   recipient:=(p->>'personId')::uuid;
   if not exists(select 1 from public.tabby_members where id=recipient and circle_id=c and user_id is null) then raise exception 'Choose a person who has not joined yet.'; end if;
   update public.tabby_invites set revoked=true where person_id=recipient and accepted_at is null;
   insert into public.tabby_invites(circle_id,person_id,token_hash,created_by) values(c,recipient,p->>'tokenHash',u) returning id into r;
 elsif op='add_entry' then
   a:=(p->>'amount')::integer; payer:=(p->>'payerId')::uuid; recipient:=nullif(p->>'recipientId','')::uuid;
   if not exists(select 1 from public.tabby_members where id=payer and circle_id=c) then raise exception 'Payer must belong to this circle.'; end if;
   if p->>'kind'='expense' then
     s:=p->'shares'; perform tabby_private.validate_shares(c,a,s); recipient:=null;
   elsif p->>'kind'='payment' then
     s:='[]'::jsonb;
     if payer<>member_id then raise exception 'Record payments from your own account. The recipient will confirm receipt.' using errcode='42501'; end if;
     if recipient is null or payer=recipient or not exists(select 1 from public.tabby_members where id=recipient and circle_id=c) then raise exception 'Choose another person in this circle as recipient.'; end if;
   else raise exception 'Choose expense or payment.';
   end if;
   insert into public.tabby_entries(id,circle_id,kind,title,amount,payer_id,recipient_id,shares,date,vendor,category,note,status,created_by,recurrence_key)
   values(coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()),c,p->>'kind',btrim(p->>'title'),a,payer,recipient,s,(p->>'date')::date,p->>'vendor',p->>'category',p->>'note',case when p->>'kind'='payment' then 'pending' else 'confirmed' end,u,nullif(p->>'recurrenceKey','')) returning id into r;
 elsif op='confirm_payment' then
   if e.kind<>'payment' or e.status<>'pending' then raise exception 'Only pending payments can be confirmed.'; end if;
   if e.recipient_id<>member_id or e.created_by=u then raise exception 'Only the recipient can confirm receipt.' using errcode='42501'; end if;
   update public.tabby_entries set status='confirmed',confirmed_by=u where id=e.id; r:=e.id;
 elsif op='void_entry' then
   if e.created_by<>u and not owns then raise exception 'Only the person who recorded it or the circle owner can void this entry.' using errcode='42501'; end if;
   if e.status='void' then raise exception 'This entry is already void.'; end if;
   update public.tabby_entries set status='void' where id=e.id; r:=e.id;
 elsif op='add_recurring' then
   payer:=(p->>'payerId')::uuid; a:=(p->>'amount')::integer; s:=p->'shares';
   if not exists(select 1 from public.tabby_members where id=payer and circle_id=c) then raise exception 'Payer must belong to this circle.'; end if;
   perform tabby_private.validate_shares(c,a,s);
   insert into public.tabby_recurring(id,circle_id,title,amount,payer_id,shares,day_of_month,next_date,vendor,category,note,created_by)
   values(coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()),c,btrim(p->>'title'),a,payer,s,(p->>'dayOfMonth')::integer,(p->>'nextDate')::date,p->>'vendor',p->>'category',p->>'note',u) returning id into r;
 elsif op='toggle_recurring' then
   if rec.created_by<>u and not owns then raise exception 'Only the bill creator or circle owner can change it.' using errcode='42501'; end if;
   update public.tabby_recurring set active=(p->>'active')::boolean where id=rec.id; r:=rec.id;
 else raise exception 'Unknown action.';
 end if;
 insert into public.tabby_audit(circle_id,actor_id,action,record_id,detail) values(c,u,op,r,case when op='void_entry' then jsonb_build_object('reason',left(coalesce(p->>'reason',''),500)) else '{}'::jsonb end);
 return jsonb_build_object('id',r);
end $$;

create function public.tabby_command(op text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select tabby_private.command(op,p); $$;

alter table public.tabby_circles enable row level security;
alter table public.tabby_members enable row level security;
alter table public.tabby_entries enable row level security;
alter table public.tabby_recurring enable row level security;
alter table public.tabby_invites enable row level security;
alter table public.tabby_audit enable row level security;
create policy tabby_circles_read on public.tabby_circles for select to authenticated using(tabby_private.is_member(id));
create policy tabby_members_read on public.tabby_members for select to authenticated using(tabby_private.is_member(circle_id));
create policy tabby_entries_read on public.tabby_entries for select to authenticated using(tabby_private.is_member(circle_id));
create policy tabby_recurring_read on public.tabby_recurring for select to authenticated using(tabby_private.is_member(circle_id));
create policy tabby_audit_read on public.tabby_audit for select to authenticated using(tabby_private.is_member(circle_id));
-- Invites have NO read policy. Tokens/hashes, recipient emails and user lists never leak.
revoke all on public.tabby_circles,public.tabby_members,public.tabby_entries,public.tabby_recurring,public.tabby_invites,public.tabby_audit from public,anon,authenticated;
revoke all on sequence public.tabby_audit_id_seq from public,anon,authenticated;
grant select on public.tabby_circles,public.tabby_members,public.tabby_entries,public.tabby_recurring,public.tabby_audit to authenticated;
revoke all on all functions in schema tabby_private from public,anon,authenticated;
grant execute on function tabby_private.is_member(uuid),tabby_private.command(text,jsonb) to authenticated;
revoke all on function public.tabby_command(text,jsonb) from public,anon;
grant execute on function public.tabby_command(text,jsonb) to authenticated;
comment on table public.tabby_circles is 'All claimed members can see all ledger entries in this circle. Use separate circles for private relationships.';
commit;
