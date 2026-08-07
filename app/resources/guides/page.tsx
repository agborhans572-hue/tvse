import type { Metadata } from "next";
import { ResourceListing } from "../../components/ResourceViews";
import { getPublishedEntries } from "../../../lib/public-content";

export const metadata:Metadata={title:"How-to travel guides | TVSE",description:"Practical travel planning guidance from TVSE specialists.",alternates:{canonical:"/resources/guides"}};
export default async function GuidesPage(){return <ResourceListing title="How To Guides" intro="Clear advice for planning better holidays, safaris and business journeys." entries={await getPublishedEntries("guide")} type="guide"/>;}
