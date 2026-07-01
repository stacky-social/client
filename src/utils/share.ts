import { notifications } from "@mantine/notifications";

/**
 * Copy a URL to the clipboard and toast the result. Returns true on success.
 * Centralised so both share buttons (share-a-post, share-a-pairing) behave
 * identically. Swap-to-real later: the link shapes stay the same; only the host
 * changes.
 */
export async function copyLink(url: string, label = "Link copied"): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    } else {
      throw new Error("clipboard unavailable");
    }
    notifications.show({ title: label, message: url, color: "blue" });
    return true;
  } catch {
    notifications.show({ title: "Couldn't copy link", message: url, color: "red" });
    return false;
  }
}
