create table public.device_photos (
 device_id uuid primary key references public.devices(id) on delete cascade,
 store_id uuid not null references public.stores(id),
 object_path text not null unique,
 constraint device_photo_path check (split_part(object_path,'/',1)=store_id::text and split_part(object_path,'/',2)=device_id::text)
);
alter table public.device_photos enable row level security;
grant select,insert,update,delete on public.device_photos to authenticated;
create policy device_photos_read on public.device_photos for select to authenticated using(public.can_access(store_id));
create policy device_photos_insert on public.device_photos for insert to authenticated with check(public.can_access(store_id,array['admin','gerente']) and exists(select 1 from public.devices d where d.id=device_id and d.store_id=device_photos.store_id));
create policy device_photos_update on public.device_photos for update to authenticated using(public.can_access(store_id,array['admin','gerente'])) with check(public.can_access(store_id,array['admin','gerente']) and exists(select 1 from public.devices d where d.id=device_id and d.store_id=device_photos.store_id));
create policy device_photos_delete on public.device_photos for delete to authenticated using(public.can_access(store_id,array['admin','gerente']));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ultra-device-photos','ultra-device-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy device_photo_objects_read on storage.objects for select to authenticated using(bucket_id='ultra-device-photos' and exists(select 1 from public.devices d where d.store_id::text=(storage.foldername(name))[1] and d.id::text=(storage.foldername(name))[2] and public.can_access(d.store_id)));
create policy device_photo_objects_insert on storage.objects for insert to authenticated with check(bucket_id='ultra-device-photos' and exists(select 1 from public.devices d where d.store_id::text=(storage.foldername(name))[1] and d.id::text=(storage.foldername(name))[2] and public.can_access(d.store_id,array['admin','gerente'])));
create policy device_photo_objects_delete on storage.objects for delete to authenticated using(bucket_id='ultra-device-photos' and exists(select 1 from public.devices d where d.store_id::text=(storage.foldername(name))[1] and d.id::text=(storage.foldername(name))[2] and public.can_access(d.store_id,array['admin','gerente'])));
