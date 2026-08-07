import type { Metadata } from "next";
import { ResourceListing } from "../../components/ResourceViews";
import { getPublishedEntries } from "../../../lib/public-content";

export const metadata:Metadata={title:"Travel stories | TVSE",description:"Destination stories and inspiration from TVSE Travel Agency Ltd.",alternates:{canonical:"/resources/blog"}};
export default async function BlogPage(){return <ResourceListing title="Blog" intro="Stories, places and considered ways to experience the world." entries={await getPublishedEntries("article")} type="article"/>;}
