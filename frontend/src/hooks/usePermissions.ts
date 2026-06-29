import { useAuthStore } from "@/store/authStore";

export const usePermissions = () => {
  const { user } = useAuthStore();

  const isTeacher = user?.role === "Teacher";
  const isAdmin = user?.role === "Admin" || user?.role === "Super Admin";
  const isSubAdmin = user?.role === "Sub Admin";
  const isSalesPerson = user?.role === "Sales Person";
  const permissions = user?.permissions || {};

  const canRead = (module: string) => {
    if (isTeacher) return true;
    if (isAdmin) return true;
    if (isSalesPerson) return module === "demoSessions";
    if (isSubAdmin) return permissions[module]?.read === true;
    return false;
  };

  const canWrite = (module: string) => {
    if (isTeacher) return true; // Handled per component if teachers have limitations
    if (isAdmin) return true;
    if (isSalesPerson) return module === "demoSessions";
    if (isSubAdmin) return permissions[module]?.write === true;
    return false;
  };

  return { canRead, canWrite, isTeacher, isAdmin, isSubAdmin, isSalesPerson };
};
