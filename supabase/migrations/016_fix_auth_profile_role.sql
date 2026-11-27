-- Create Auth profiles without resolving types through the caller's search_path.
-- Role assignment stays trusted: user-editable metadata must not grant admin access.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'customer'::public.user_role
  );
  RETURN NEW;
END;
$$;
