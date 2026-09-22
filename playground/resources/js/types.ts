export interface Customer {
    id: number
    name: string
    email: string
    company: string | null
    status: 'active' | 'inactive'
    locked: boolean
    avatar_url: string | null
    notes?: string | null
    created_at: string | null
    updated_at: string | null
}

export interface Paginated<T> {
    data: T[]
    links: { first: string | null; last: string | null; prev: string | null; next: string | null }
    meta: {
        current_page: number
        from: number | null
        last_page: number
        links: Array<{ url: string | null; label: string; page: number | null; active: boolean }>
        path: string
        per_page: number
        to: number | null
        total: number
    }
}

export interface SharedProps extends Record<string, unknown> {
    auth: { user: { id: number; name: string; email: string } | null }
    flash: { message?: string; level?: string } | null
    errors: Record<string, string[]>
}
