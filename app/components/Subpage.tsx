"use client";

import type { TvsePage } from "../page-data";
import { ReferencePage } from "./ReferencePages";

export function Subpage({ page }: { page: TvsePage }) {
  return <ReferencePage page={page} />;
}
