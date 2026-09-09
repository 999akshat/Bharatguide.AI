-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Documents
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  source_language TEXT,
  target_language TEXT NOT NULL,
  summary TEXT,
  original_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads documents" ON public.documents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner inserts documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner updates documents" ON public.documents FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner deletes documents" ON public.documents FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX documents_user_created_idx ON public.documents (user_id, created_at DESC);

-- Steps
CREATE TABLE public.steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  original_excerpt TEXT,
  visual_prompt TEXT NOT NULL DEFAULT '',
  video_status TEXT NOT NULL DEFAULT 'idle',
  video_job_id TEXT,
  video_path TEXT,
  video_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.steps TO authenticated;
GRANT ALL ON public.steps TO service_role;
ALTER TABLE public.steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads steps" ON public.steps FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner inserts steps" ON public.steps FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner updates steps" ON public.steps FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner deletes steps" ON public.steps FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX steps_document_idx ON public.steps (document_id, step_index);