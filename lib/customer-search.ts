export type CustomerSearchRecord = {
  label: string;
  code?: string;
  email?: string | null;
  phone?: string | null;
};

function haystack(customer: CustomerSearchRecord): string {
  return [customer.code, customer.label, customer.email, customer.phone]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Token match against name, code, email, or phone. Empty query matches all. */
export function matchesCustomerQuery(customer: CustomerSearchRecord, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = haystack(customer);
  return tokens.every((token) => hay.includes(token));
}
