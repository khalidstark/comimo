import type { Metadata } from "next";
import { PrintIssue } from "@/components/magazine/PrintIssue";
import { sampleIssue } from "@/lib/magazine/sample";

export const metadata: Metadata = {
  title: "Print the issue",
  description: "The month's comic magazine on A4 pages, ready to print or save as PDF.",
};

/** Every page of an issue on its own A4 sheet. */
export default function PrintPage() {
  return <PrintIssue sample={sampleIssue()} />;
}
