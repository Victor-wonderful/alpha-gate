import { RankingsClient } from "./rankings-client";
import { ClusterTabs, clusters } from "@/components/app/cluster-tabs";

export default function RankingsPage() {
  const cluster = clusters.results();
  return (
    <div className="space-y-5">
      <ClusterTabs title={cluster.title} description={cluster.description} tabs={cluster.tabs} />
      <RankingsClient />
    </div>
  );
}
