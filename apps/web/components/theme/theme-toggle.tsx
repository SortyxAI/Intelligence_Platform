"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className={cn("h-9", collapsed ? "w-10" : "w-full")} />;

  return (
    <Button
      variant="ghost"
      size={collapsed ? "icon" : "sm"}
      className={cn(
        "w-full justify-start text-muted-foreground hover:text-foreground",
        collapsed && "w-10 h-9 mx-auto"
      )}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!collapsed && <span className="ml-2">{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </Button>
  );
}
