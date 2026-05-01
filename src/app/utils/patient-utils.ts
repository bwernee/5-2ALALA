export function formatFullName(lastName?: string, firstName?: string): string {
  const last = (lastName || '').trim();
  const first = (firstName || '').trim();
  if (!last && !first) return '';
  if (!last) return first;
  if (!first) return last;
  return `${last}, ${first}`;
}

export function calculateAge(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  if (age < 0 || age > 150) return null;
  return age;
}

