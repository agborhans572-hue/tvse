import type { Metadata } from "next";
import { ResourceListing } from "../components/ResourceViews";
import { getPublishedEntries } from "../../lib/public-content";

export const metadata:Metadata={title:"Travel resources | TVSE",description:"Destination ideas, practical travel guides and thoughtful advice from TVSE.",alternates:{canonical:"/resources"}};
export default async function ResourcesPage(){return <ResourceListing title="Travel ideas that take you further." intro="Destination stories and practical guidance from the specialists who shape TVSE journeys." entries={await getPublishedEntries()}/>;}
