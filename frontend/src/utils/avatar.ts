const DUMMY_KEYWORDS = new Set([
  "test",
  "dummy",
  "admin",
  "administrator",
  "anonymous",
  "fake",
  "user",
  "sample",
  "demo",
  "asdf",
  "qwerty",
  "none",
  "null",
  "unknown",
  "testing",
  "temp",
  "placeholder",
]);

export interface NameValidationResult {
  isValid: boolean;
  error?: string;
  formattedName?: string;
}

export function validateFullName(name: string): NameValidationResult {
  const clean = name.trim();
  if (!clean) {
    return { isValid: false, error: "Please enter your full name." };
  }
  if (clean.length < 3) {
    return { isValid: false, error: "Full name must be at least 3 characters long." };
  }

  // Check repetitive keyboard smash (e.g. aaaa, xxxx)
  if (/(.)\1{3,}/i.test(clean)) {
    return {
      isValid: false,
      error: "Please enter a legitimate full name without repetitive characters.",
    };
  }

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return {
      isValid: false,
      error: "Please provide both first and last name (e.g., 'Jane Doe').",
    };
  }

  for (const word of words) {
    const cleanWord = word.replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (DUMMY_KEYWORDS.has(cleanWord)) {
      return {
        isValid: false,
        error: `'${word}' is a placeholder term. Please use your real name.`,
      };
    }
    if (cleanWord.length < 2) {
      return {
        isValid: false,
        error: "Each name part must be at least 2 letters long.",
      };
    }
  }

  if (!/^[A-Za-z]+(?:[' -][A-Za-z]+)*$/.test(clean)) {
    return {
      isValid: false,
      error: "Full name can only contain letters, spaces, hyphens, and apostrophes.",
    };
  }

  const formattedName = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return { isValid: true, formattedName };
}

export interface AvatarTheme {
  bg: string;
  border: string;
  text: string;
  initials: string;
}

const BRAND_AVATAR_PALETTES = [
  { bg: "#183E6C", border: "#102B4F", text: "#FFFFFF" }, // Deep Navy
  { bg: "#B84328", border: "#8C2E16", text: "#FFFFFF" }, // Terracotta
  { bg: "#A55B20", border: "#7A3F10", text: "#FFFFFF" }, // Earth Ochre
  { bg: "#1D4E43", border: "#12332B", text: "#FFFFFF" }, // Forest Slate
  { bg: "#3D251A", border: "#24140D", text: "#FFFFFF" }, // Warm Espresso
  { bg: "#253E5C", border: "#16283D", text: "#FFFFFF" }, // Steel Indigo
];

export function getDeterministicAvatar(name?: string, email?: string): AvatarTheme {
  const seed = (name || email || "Ambient").trim();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % BRAND_AVATAR_PALETTES.length;
  const palette = BRAND_AVATAR_PALETTES[index];

  let initials = "";
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      initials = `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    } else if (parts.length === 1 && parts[0].length >= 2) {
      initials = parts[0].slice(0, 2).toUpperCase();
    } else {
      initials = (parts[0] || "A")[0].toUpperCase();
    }
  } else if (email && email.trim()) {
    const cleanPrefix = email.split("@")[0].replace(/[^a-zA-Z]/g, "");
    initials = (cleanPrefix.slice(0, 2) || "U").toUpperCase();
  } else {
    initials = "AI";
  }

  return {
    ...palette,
    initials,
  };
}
