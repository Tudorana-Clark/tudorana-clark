import { Newsletter } from "@/components/Newsletter";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { TagManager } from "@/components/TagManager";
import { JsonLd } from "@/components/ui";
import { personNode, websiteNode } from "@/lib/jsonld";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <JsonLd data={{ "@context": "https://schema.org", "@graph": [websiteNode(), personNode()] }} />
      <SiteHeader />
      <main id="main">{children}</main>
      <Newsletter />
      <SiteFooter />
      <TagManager />
    </>
  );
}
