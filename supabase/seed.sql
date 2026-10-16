insert into public.departments (name)
values
  ('Computer Science'),
  ('Electrical Engineering'),
  ('Business Administration'),
  ('Mass Communication'),
  ('Applied Sciences')
on conflict (name) do nothing;

insert into public.sessions (name, cutoff_mark, opens_at, closes_at)
values (
  '2026/2027',
  50,
  now(),
  now() + interval '60 days'
)
on conflict (name) do nothing;
