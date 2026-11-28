-- Allow admins to create and remove compartments only for bins in their organization.
DROP POLICY IF EXISTS compartments_update ON public.bin_compartments;

CREATE POLICY compartments_insert_admin ON public.bin_compartments
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.bins b
    WHERE b.id = public.bin_compartments.bin_id
      AND b.organization_id = public.get_user_org_id()
      AND public.get_user_role() = 'admin'
  )
);

CREATE POLICY compartments_update ON public.bin_compartments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.bins b
    WHERE b.id = public.bin_compartments.bin_id
      AND b.organization_id = public.get_user_org_id()
      AND public.get_user_role() = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.bins b
    WHERE b.id = public.bin_compartments.bin_id
      AND b.organization_id = public.get_user_org_id()
      AND public.get_user_role() = 'admin'
  )
);

CREATE POLICY compartments_delete_admin ON public.bin_compartments
FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM public.bins b
    WHERE b.id = public.bin_compartments.bin_id
      AND b.organization_id = public.get_user_org_id()
      AND public.get_user_role() = 'admin'
  )
);