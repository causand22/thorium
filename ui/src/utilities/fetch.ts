// project imports
import { getImage } from '@thorpi/images';
import { Image } from '@models/images';

/**
 * Fetch a single image and push it into component state, toggling a loading flag around the request.
 *
 * A no-op (other than the loading toggle) if `group` or `name` is missing, or if the image isn't found.
 *
 * @param image - Partial image identity; both `group` and `name` must be present to fetch.
 * @param setImage - State setter called with the fetched {@link Image} on success.
 * @param setLoading - State setter toggled `true` before the request and `false` after.
 */
export async function fetchSingleImage(
  image: { group?: string; name?: string },
  setImage: (image: Image) => void,
  setLoading: (loading: boolean) => void,
) {
  setLoading(true);
  if (image?.group && image?.name) {
    const reqImage = await getImage(image.group, image.name);
    if (reqImage) {
      setImage(reqImage);
    }
  }
  setLoading(false);
}
