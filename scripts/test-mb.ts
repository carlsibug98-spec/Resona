import { getCredits } from "../src/lib/server/musicbrainz";

const r = await getCredits("Let It Be", "The Beatles");
console.log(JSON.stringify(r, null, 2));
