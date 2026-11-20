import { useState, useEffect, useCallback } from 'react'
import './App.css'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

const CATEGORIES = ['Laptop', 'Projector', 'IoT Kit', 'Server']
const STATUS_OPTIONS = ['Available', 'In Use', 'Maintenance']

function App() {
  const [equipment, setEquipment] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    inUse: 0,
    maintenance: 0,
  })

  // Filter and Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Form state
  const [formData, setFormData] = useState({
    item_name: '',
    category: 'Laptop',
    lab_room: '',
    status: 'Available',
    assigned_to: '',
  })

  // UI state
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [notification, setNotification] = useState(null)

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr))
    }, 4000)
  }

  // Fetch overall stats (unfiltered)
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/equipment`)
      if (!res.ok) throw new Error('Failed to fetch statistics')
      const allItems = await res.json()
      setStats({
        total: allItems.length,
        available: allItems.filter((i) => i.status === 'Available').length,
        inUse: allItems.filter((i) => i.status === 'In Use').length,
        maintenance: allItems.filter((i) => i.status === 'Maintenance').length,
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }, [])

  // Fetch equipment list (with optional search and status filters)
  const fetchEquipment = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim())
      }
      if (statusFilter && statusFilter !== 'All') {
        params.append('status', statusFilter.trim())
      }

      const queryString = params.toString() ? `?${params.toString()}` : ''
      const res = await fetch(`${API_URL}/api/equipment${queryString}`)

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`)
      }
      const data = await res.json()
      setEquipment(data)
    } catch (err) {
      console.error('Error fetching equipment:', err)
      showNotification('error', `Could not connect to backend at ${API_URL}. Please ensure server is running.`)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, statusFilter])

  // Refresh equipment and stats on search or filter change (with debounce on search)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEquipment()
      fetchStats()
    }, 250)
    return () => clearTimeout(timer)
  }, [fetchEquipment, fetchStats])

  // Seed handler (POST /api/seed)
  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch(`${API_URL}/api/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed to seed database')
      const data = await res.json()

      if (data.seeded) {
        showNotification('success', `Success: Inserted ${data.count} sample lab equipment items.`)
      } else {
        showNotification('info', data.message || 'Database already has equipment records.')
      }
      fetchEquipment()
      fetchStats()
    } catch (err) {
      console.error('Seeding error:', err)
      showNotification('error', 'Error loading sample data. Is the backend server running?')
    } finally {
      setSeeding(false)
    }
  }

  // Add Equipment Form Submit (POST /api/equipment)
  const handleAddSubmit = async (e) => {
    e.preventDefault()
    if (!formData.item_name.trim() || !formData.lab_room.trim()) {
      showNotification('error', 'Item name and lab room are required.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        item_name: formData.item_name.trim(),
        category: formData.category,
        lab_room: formData.lab_room.trim(),
        status: formData.status,
        assigned_to: formData.assigned_to.trim() || null,
      }

      const res = await fetch(`${API_URL}/api/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to add equipment')
      }

      showNotification('success', `Added "${formData.item_name.trim()}" successfully!`)
      setFormData({
        item_name: '',
        category: 'Laptop',
        lab_room: '',
        status: 'Available',
        assigned_to: '',
      })
      fetchEquipment()
      fetchStats()
    } catch (err) {
      console.error('Add error:', err)
      showNotification('error', err.message || 'Failed to add equipment.')
    } finally {
      setSubmitting(false)
    }
  }

  // Inline Status Change (PUT /api/equipment/{id})
  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id)
    try {
      const res = await fetch(`${API_URL}/api/equipment/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        throw new Error('Failed to update status')
      }

      // Optimistic update
      setEquipment((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      )
      showNotification('success', `Equipment #${id} status updated to ${newStatus}.`)
      fetchStats()
    } catch (err) {
      console.error('Update error:', err)
      showNotification('error', 'Could not update equipment status.')
      fetchEquipment()
    } finally {
      setUpdatingId(null)
    }
  }

  // Delete Equipment (DELETE /api/equipment/{id})
  const handleDelete = async (id, itemName) => {
    if (!window.confirm(`Are you sure you want to delete "${itemName}" (#${id})?`)) {
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/equipment/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete equipment')
      }

      showNotification('success', `Deleted "${itemName}" (#${id}) successfully.`)
      setEquipment((prev) => prev.filter((item) => item.id !== id))
      fetchStats()
    } catch (err) {
      console.error('Delete error:', err)
      showNotification('error', 'Could not delete equipment.')
      fetchEquipment()
    }
  }

  return (
    <div className="dashboard-container">
      {/* Toast Notification */}
      {notification && (
        <div className={`notification-banner ${notification.type}`}>
          <span className="notif-text">{notification.message}</span>
          <button
            type="button"
            className="notif-close"
            onClick={() => setNotification(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <header className="dashboard-header">
        <div className="header-brand">
          <div className="brand-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div>
            <h1 className="header-title">AIML Lab Equipment Tracker</h1>
            <p className="header-subtitle">Real-time laboratory asset inventory and allocation system</p>
          </div>
        </div>
        <button
          type="button"
          className="btn-seed"
          onClick={handleSeed}
          disabled={seeding}
        >
          {seeding ? (
            <span className="btn-loading">
              <span className="spinner"></span> Loading Data...
            </span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7" />
                <path d="M4 7c0-2 1.5-3 3.5-3h9c2 0 3.5 1 3.5 3" />
                <path d="M4 7c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3" />
                <path d="M4 12c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3" />
              </svg>
              Load Sample Data
            </>
          )}
        </button>
      </header>

      {/* Summary Cards */}
      <section className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Equipment</span>
            <span className="stat-value">{stats.total}</span>
          </div>
        </div>

        <div className="stat-card stat-available">
          <div className="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-label">Available</span>
            <span className="stat-value">{stats.available}</span>
          </div>
        </div>

        <div className="stat-card stat-in-use">
          <div className="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-label">In Use</span>
            <span className="stat-value">{stats.inUse}</span>
          </div>
        </div>

        <div className="stat-card stat-maintenance">
          <div className="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-label">Maintenance</span>
            <span className="stat-value">{stats.maintenance}</span>
          </div>
        </div>
      </section>

      {/* Add Equipment Form */}
      <section className="form-card">
        <div className="section-header">
          <h2 className="section-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Add New Equipment
          </h2>
          <span className="section-desc">Register hardware, computing nodes, or peripheral instruments</span>
        </div>
        <form className="inline-equipment-form" onSubmit={handleAddSubmit}>
          <div className="form-group flex-2">
            <label htmlFor="item_name">Item Name *</label>
            <input
              id="item_name"
              type="text"
              placeholder="e.g. Dell Precision 3660"
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              required
            />
          </div>

          <div className="form-group flex-1">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group flex-1">
            <label htmlFor="lab_room">Lab Room *</label>
            <input
              id="lab_room"
              type="text"
              placeholder="e.g. Lab 204"
              value={formData.lab_room}
              onChange={(e) => setFormData({ ...formData, lab_room: e.target.value })}
              required
            />
          </div>

          <div className="form-group flex-1">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              {STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group flex-2">
            <label htmlFor="assigned_to">Assigned To</label>
            <input
              id="assigned_to"
              type="text"
              placeholder="e.g. Dr. John Doe (optional)"
              value={formData.assigned_to}
              onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
            />
          </div>

          <div className="form-group form-action">
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Adding...' : '+ Add Equipment'}
            </button>
          </div>
        </form>
      </section>

      {/* Filter & Search Bar */}
      <section className="table-controls-card">
        <div className="controls-wrapper">
          <div className="search-bar">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by item name, room, category, or assignee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="filter-group">
            <label htmlFor="filter-status" className="filter-label">
              Filter by Status:
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="controls-meta">
          <span className="results-count">
            {loading ? 'Refreshing...' : `Showing ${equipment.length} item${equipment.length === 1 ? '' : 's'}`}
          </span>
          {(searchQuery || statusFilter !== 'All') && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('All')
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </section>

      {/* Equipment Table */}
      <section className="table-card">
        <div className="table-responsive">
          <table className="equipment-table">
            <thead>
              <tr>
                <th className="th-id">ID</th>
                <th className="th-name">Item Name</th>
                <th className="th-category">Category</th>
                <th className="th-room">Lab Room</th>
                <th className="th-status">Status</th>
                <th className="th-assigned">Assigned To</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {equipment.length > 0 ? (
                equipment.map((item) => (
                  <tr key={item.id} className="table-row">
                    <td className="td-id">#{item.id}</td>
                    <td className="td-name">
                      <strong>{item.item_name}</strong>
                    </td>
                    <td className="td-category">
                      <span className={`category-badge category-${item.category.toLowerCase().replace(/\s+/g, '-')}`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="td-room">
                      <span className="room-indicator">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {item.lab_room}
                      </span>
                    </td>
                    <td className="td-status">
                      <div className="status-dropdown-wrapper">
                        <select
                          className={`status-select status-${item.status.toLowerCase().replace(/\s+/g, '-')}`}
                          value={item.status}
                          disabled={updatingId === item.id}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                        >
                          {STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                        {updatingId === item.id && <span className="mini-spinner"></span>}
                      </div>
                    </td>
                    <td className="td-assigned">
                      {item.assigned_to ? (
                        <span className="assignee-tag">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          {item.assigned_to}
                        </span>
                      ) : (
                        <span className="unassigned-text">Unassigned</span>
                      )}
                    </td>
                    <td className="td-actions">
                      <button
                        type="button"
                        className="btn-delete"
                        onClick={() => handleDelete(item.id, item.item_name)}
                        title={`Delete ${item.item_name}`}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="table-empty">
                    <div className="empty-state">
                      <div className="empty-icon">
                        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                          <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                        </svg>
                      </div>
                      <h3>No equipment found</h3>
                      <p>
                        {searchQuery || statusFilter !== 'All'
                          ? 'Try adjusting your search criteria or resetting filters.'
                          : 'The inventory is currently empty. Add new equipment using the form above or click "Load Sample Data".'}
                      </p>
                      {equipment.length === 0 && !searchQuery && statusFilter === 'All' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleSeed}
                          disabled={seeding}
                        >
                          Load Sample Data
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default App
