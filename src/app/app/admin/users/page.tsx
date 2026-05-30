import { listAllUsers } from "@/lib/admin/data";
import { UsersTable } from "@/components/admin/users-table";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await listAllUsers();
  return <UsersTable users={users} />;
}
