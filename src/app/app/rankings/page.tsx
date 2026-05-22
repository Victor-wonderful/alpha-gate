import { RankingsClient } from "./rankings-client";
import { ClusterTabs } from "@/components/app/cluster-tabs";
import { clusters } from "@/components/app/cluster-tabs-config";
import { HelpLink } from "@/components/app/help-link";

export default function RankingsPage() {
  const cluster = clusters.results({
    rightSlot: <HelpLink href="/app/guide/results" />,
  });
  return (
    <div className="space-y-5">
      <ClusterTabs
        title={cluster.title}
        description={cluster.description}
        tabs={cluster.tabs}
        rightSlot={cluster.rightSlot}
      />
      <RankingsClient />
    </div>
  );
}
