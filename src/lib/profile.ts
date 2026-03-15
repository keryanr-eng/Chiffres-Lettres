const KEY = 'cl_profile';

export interface LocalProfile {
  id: string;
  pseudo: string;
}

export const readProfile = (): LocalProfile | null => {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalProfile;
  } catch {
    return null;
  }
};

export const saveProfile = (pseudo: string): LocalProfile => {
  const profile = {
    id: crypto.randomUUID(),
    pseudo: pseudo.trim(),
  };
  localStorage.setItem(KEY, JSON.stringify(profile));
  return profile;
};
