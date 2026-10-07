import { redirect } from "next/navigation";

// The developer console lives in the provider portal (it needs the signed-in owner's business). The old page at this
// address generated tokens in the browser and held no real credentials; it is gone. Keep the address working for
// bookmarks and links.
export default function DeveloperRedirect() {
  redirect("/provider/developer");
}
