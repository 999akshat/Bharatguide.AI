export type TargetLanguageCode = "hi" | "ta" | "te" | "bn";

export interface TargetLanguage {
  code: TargetLanguageCode;
  englishName: string;
  nativeName: string;
  script: string;
  fontClass: string;
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  {
    code: "hi",
    englishName: "Hindi",
    nativeName: "हिंदी",
    script: "Devanagari",
    fontClass: "font-devanagari",
  },
  {
    code: "ta",
    englishName: "Tamil",
    nativeName: "தமிழ்",
    script: "Tamil",
    fontClass: "font-tamil",
  },
  {
    code: "te",
    englishName: "Telugu",
    nativeName: "తెలుగు",
    script: "Telugu",
    fontClass: "font-telugu",
  },
  {
    code: "bn",
    englishName: "Bengali",
    nativeName: "বাংলা",
    script: "Bengali",
    fontClass: "font-bengali",
  },
];

export function getLanguage(code: string): TargetLanguage | undefined {
  return TARGET_LANGUAGES.find((language) => language.code === code);
}
