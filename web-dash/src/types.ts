export type Tenant = {
  id: string;
  slug: string;
  display_name: string;
  domain: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
