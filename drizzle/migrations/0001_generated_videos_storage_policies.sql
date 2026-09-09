CREATE POLICY "Owner reads own generated videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'generated-videos' AND owner = auth.uid());

CREATE POLICY "Owner uploads own generated videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'generated-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owner updates own generated videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'generated-videos' AND owner = auth.uid());

CREATE POLICY "Owner deletes own generated videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'generated-videos' AND owner = auth.uid());