import {
  Heebo_400Regular,
  Heebo_500Medium,
  Heebo_700Bold,
  useFonts as useHeeboFonts,
} from '@expo-google-fonts/heebo';

/** Loads the AutoKeep Hebrew typeface (Heebo, SIL OFL). Returns true once ready or on failure. */
export function useAppFonts(): boolean {
  const [loaded, error] = useHeeboFonts({ Heebo_400Regular, Heebo_500Medium, Heebo_700Bold });
  // On a font load failure we fall back to the system font rather than block the app.
  return loaded || error != null;
}
