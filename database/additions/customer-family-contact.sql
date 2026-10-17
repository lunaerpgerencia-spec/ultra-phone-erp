alter table public.customers
 add column family_name text not null default '' check(length(family_name)<=200),
 add column family_relationship text not null default '' check(length(family_relationship)<=100),
 add column family_phone text not null default '' check(length(family_phone)<=40),
 add column family_address text not null default '' check(length(family_address)<=500);
