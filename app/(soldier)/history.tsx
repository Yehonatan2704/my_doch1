import { Redirect } from 'expo-router';

/** History now lives in the single calendar tab (DESIGN.md §7.3). */
export default function History() {
  return <Redirect href="/future" />;
}
