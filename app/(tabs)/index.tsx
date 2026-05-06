import { Link } from "expo-router";
import type { Href } from "expo-router";
import type { ReactNode } from "react";
import {
  Activity,
  Archive,
  Network,
  ShieldAlert,
  Wrench,
} from "lucide-react-native";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  mockDevices,
  mockRisks,
  mockScan,
  mockSite,
} from "../../src/data/mockData";

export default function HomeScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Text style={styles.eyebrow}>Current network</Text>
        <Text style={styles.title}>{mockScan.networkName}</Text>
        <Text style={styles.subtitle}>
          {mockSite.clientName} · {mockSite.siteName}
        </Text>

        <View style={styles.grid}>
          <Metric label="Subnet" value={mockScan.subnet} />
          <Metric label="Gateway" value={mockScan.gatewayIp} />
          <Metric label="Devices" value={String(mockDevices.length)} />
          <Metric label="Risks" value={String(mockRisks.length)} />
        </View>

        <Link href="/(tabs)/scan" asChild>
          <TouchableOpacity style={styles.primaryButton}>
            <Activity color="#fff" size={20} />
            <Text style={styles.primaryButtonText}>Start Standard Scan</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.navGrid}>
        <NavCard
          href="/(tabs)/devices"
          icon={<Network color="#93c5fd" />}
          title="Devices"
          subtitle="Inventory and services"
        />
        <NavCard
          href="/(tabs)/risks"
          icon={<ShieldAlert color="#fca5a5" />}
          title="Risks"
          subtitle="Findings and actions"
        />
        <NavCard
          href="/(tabs)/tools"
          icon={<Wrench color="#c4b5fd" />}
          title="Tools"
          subtitle="Ping, DNS, traceroute"
        />
        <NavCard
          href="/(tabs)/sites"
          icon={<Archive color="#86efac" />}
          title="Sites"
          subtitle="Client profiles"
        />
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function NavCard({
  href,
  icon,
  title,
  subtitle,
}: {
  href: Href;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} asChild>
      <TouchableOpacity style={styles.navCard}>
        {icon}
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navSubtitle}>{subtitle}</Text>
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#020617",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  headerCard: {
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  eyebrow: {
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: 12,
    marginBottom: 6,
  },
  title: {
    color: "#f8fafc",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#94a3b8",
    marginTop: 4,
  },
  grid: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metric: {
    width: "48%",
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 12,
  },
  metricValue: {
    color: "#f8fafc",
    fontWeight: "700",
    marginTop: 4,
  },
  primaryButton: {
    marginTop: 18,
    height: 54,
    backgroundColor: "#2563eb",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  navCard: {
    width: "48%",
    backgroundColor: "#0f172a",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  navTitle: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 16,
    marginTop: 12,
  },
  navSubtitle: {
    color: "#94a3b8",
    marginTop: 4,
    fontSize: 12,
  },
});
