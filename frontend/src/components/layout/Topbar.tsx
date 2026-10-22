import { LogOut, Menu, Moon, Sun, UserCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { roleLabel } from '@/components/Badges'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { initials } from '@/lib/utils'

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  if (!user) return null

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </Button>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-md px-1.5 hover:bg-accent sm:px-2"
            aria-label="Open user menu"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials(user.full_name)}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-40 truncate text-sm font-medium">{user.full_name}</span>
              <span className="block text-xs text-muted-foreground">{roleLabel(user.role)}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <span className="block truncate font-medium">{user.full_name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.role === 'employee' && (
            <DropdownMenuItem onSelect={() => navigate('/employee/profile')}>
              <UserCircle /> My profile
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void handleLogout()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
