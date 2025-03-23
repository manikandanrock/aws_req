import React, { useState, useEffect } from 'react';
import axios from 'axios';
import qs from 'qs';
import './Dashboard.css';
import JiraIntegrationModal from './JiraIntegrationModal';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const Dashboard = () => {
  const [requirements, setRequirements] = useState([]);
  const [overallStats, setOverallStats] = useState({ total: 0, approved: 0, inReview: 0, disapproved: 0 });
  const [filteredStats, setFilteredStats] = useState({ total: 0, approved: 0, inReview: 0, disapproved: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ type: [], status: [], complexity: [], priority: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [jiraSettings, setJiraSettings] = useState({ isConnected: false, projectKey: '' });
  const [isJiraModalOpen, setIsJiraModalOpen] = useState(false);

  const selectedProjectData = projects.find(p => p.id === selectedProject);
  const hourlyRate = selectedProjectData?.hourly_rate || 0;

  const isValidProjectId = (id) => Number.isInteger(id) && id > 0;

  const calculateCosts = (reqs) => {
    const totalHours = reqs.reduce((sum, req) => sum + (req.estimated_time || 0), 0);
    return {
      totalHours,
      totalCost: totalHours * hourlyRate
    };
  };

  const currentCosts = calculateCosts(requirements);
  const overallCosts = calculateCosts(requirements);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/projects`);
        setProjects(response.data);
      } catch (error) {
        console.error('Error fetching projects:', error);
        setError('Failed to load projects. Please try again later.');
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    const fetchOverallStats = async () => {
      if (!isValidProjectId(selectedProject)) return;

      try {
        const response = await axios.get(`${API_BASE_URL}/api/requirements/stats`, {
          params: { project: selectedProject }
        });
        setOverallStats(response.data);
      } catch (error) {
        console.error('Error fetching overall stats:', error);
        setError('Failed to load statistics. Please try again.');
      }
    };
    fetchOverallStats();
  }, [selectedProject]);

  useEffect(() => {
    const fetchRequirements = async () => {
      if (!isValidProjectId(selectedProject)) return;

      setLoading(true);
      setError('');

      try {
        const response = await axios.get(`${API_BASE_URL}/api/requirements`, {
          params: {
            project: selectedProject,
            search: searchQuery,
            ...filters,
            page: pagination.page,
            stats: true
          },
          paramsSerializer: params => qs.stringify(params, { arrayFormat: 'repeat' })
        });

        const filteredRequirements = response.data.requirements || [];
        const newFilteredStats = {
          total: filteredRequirements.length,
          approved: filteredRequirements.filter(r => r.status === 'Approved').length,
          inReview: filteredRequirements.filter(r => r.status === 'Review').length,
          disapproved: filteredRequirements.filter(r => r.status === 'Disapproved').length,
        };

        setRequirements(filteredRequirements);
        setFilteredStats(newFilteredStats);
        setPagination({
          page: response.data.page || 1,
          pages: response.data.pages || 1,
          total: response.data.total || 0,
        });
      } catch (error) {
        console.error('Error fetching requirements:', error);
        setError(error.response?.data?.error || 'Failed to load requirements');
        setRequirements([]);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchRequirements, 500);
    return () => clearTimeout(debounceTimer);
  }, [selectedProject, searchQuery, filters, pagination.page]);

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: prev[filterType].includes(value)
        ? prev[filterType].filter(f => f !== value)
        : [...prev[filterType], value]
    }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const exportData = () => {
    if (!selectedProjectData) return;

    const totalHours = requirements.reduce((sum, req) => sum + (req.estimated_time || 0), 0);
    const totalCost = totalHours * hourlyRate;

    const csvContent = [
      ['Project Name', selectedProjectData.name],
      ['Hourly Rate', `$${hourlyRate.toFixed(2)}`],
      [],
      ['ID', 'Requirement', 'Status', 'Priority', 'Complexity', 'Author', 'Date', 
       'Hours', 'Cost', 'Cost/Hour'],
      ...requirements.map(req => {
        const cost = req.estimated_time * hourlyRate;
        return [
          req.id,
          `"${req.requirement.replace(/"/g, '""')}"`,
          req.status,
          req.priority,
          req.complexity,
          req.author,
          new Date(req.date).toISOString().split('T')[0],
          req.estimated_time,
          `$${cost.toFixed(2)}`,
          `$${hourlyRate.toFixed(2)}`
        ];
      }),
      [],
      ['Total Hours', totalHours],
      ['Total Cost', `$${totalCost.toFixed(2)}`]
    ].map(e => e.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const projectName = selectedProjectData.name.replace(/[^a-z0-9]/gi, '_');
    link.href = URL.createObjectURL(blob);
    link.download = `requirements_${projectName}_export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const connectToJira = async (settings) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/jira/connect`, settings);
      if (response.data.success) {
        setJiraSettings({
          isConnected: true,
          projectKey: settings.projectKey
        });
        alert('Successfully connected to Jira!');
        setIsJiraModalOpen(false);
      }
    } catch (error) {
      console.error('Jira connection failed:', error);
      alert(error.response?.data?.error || 'Jira connection failed. Please check your settings.');
    }
  };

  axios.defaults.withCredentials = true;

  const pushToJira = async (requirementId) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/jira/push`,
        { requirementId },
        { withCredentials: true, timeout: 30000 }
      );

      if (response.data.success) {
        alert(`Created Jira issue: ${response.data.issue.key}\n${response.data.issue.url}`);
      } else {
        throw new Error(response.data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Jira push failed:', error);
      let errorMessage = error.response?.data?.error || error.message;
      
      if (errorMessage.includes('Unauthorized')) {
        errorMessage += '\n\nPlease reconnect Jira integration';
      }
      if (errorMessage.includes('projectKey')) {
        errorMessage += '\n\nVerify project key exists in Jira';
      }
      if (errorMessage.includes('issuetype')) {
        errorMessage += '\n\nCheck project has valid issue types';
      }

      alert(`Jira push failed!\n\n${errorMessage}`);
    }
  };
  const handleProjectChange = (e) => {
    const value = e.target.value;
    const projectId = value ? parseInt(value, 10) : null;
    setSelectedProject(isValidProjectId(projectId) ? projectId : null);
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>REQUIREMENTS DASHBOARD</h1>
        <div className="header-controls">
          <div className="project-selection">
            <label htmlFor="project-select">Select Project:</label>
            <select
              id="project-select"
              value={selectedProject || ''}
              onChange={handleProjectChange}
              disabled={loading}
            >
              <option value="">-- Select Project --</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className="export-button"
            onClick={exportData}
            disabled={!requirements.length || loading}
          >
            Export CSV
          </button>
          <button
            className={`jira-button ${jiraSettings.isConnected ? 'connected' : ''}`}
            onClick={() => setIsJiraModalOpen(true)}
          >
            {jiraSettings.isConnected 
              ? `Connected to Jira (${jiraSettings.projectKey})`
              : 'Connect to Jira'}
          </button>
        </div>
      </header>

      {!isValidProjectId(selectedProject) && (
        <div className="empty-state">
          Select a valid project to view requirements
        </div>
      )}

      {isValidProjectId(selectedProject) && (
        <>
          <div className="stats-container">
            <StatSection 
              title="Overall Statistics" 
              stats={overallStats}
              costs={overallCosts}
              hourlyRate={hourlyRate}
            />
            <StatSection 
              title="Filtered Statistics" 
              stats={filteredStats}
              costs={currentCosts}
              hourlyRate={hourlyRate}
            />
          </div>

          <div className="dashboard-content">
            <FiltersSidebar
              filters={filters}
              onFilterChange={handleFilterChange}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              loading={loading}
            />

            <div className="requirements-list">
              {error && (
                <div className="error-message">
                  ⚠️ {error}
                  <button onClick={() => window.location.reload()}>Retry</button>
                </div>
              )}

              {loading ? (
                <div className="loading-indicator">
                  <div className="spinner" /> Loading...
                </div>
              ) : requirements.length ? (
                <>
                  {requirements.map(req => (
                    <RequirementCard
                      key={req.id}
                      requirement={req}
                      onPushToJira={pushToJira}
                      jiraConnected={jiraSettings.isConnected}
                      hourlyRate={hourlyRate}
                    />
                  ))}
                  <PaginationControls
                    pagination={pagination}
                    onPageChange={setPagination}
                  />
                </>
              ) : (
                <div className="empty-state">
                  No requirements match current filters
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <JiraIntegrationModal
        isOpen={isJiraModalOpen}
        onClose={() => setIsJiraModalOpen(false)}
        onConnect={connectToJira}
      />
    </div>
  );
};

const StatSection = ({ title, stats, costs, hourlyRate }) => (
  <div className="stats-section">
    <h2>{title}</h2>
    <div className="dashboard-stats">
      <StatCard label="Total" value={stats.total} />
      <StatCard label="Approved" value={stats.approved} type="approved" />
      <StatCard label="In Review" value={stats.inReview} type="review" />
      <StatCard label="Disapproved" value={stats.disapproved} type="disapproved" />
      <StatCard 
        label="Hourly Rate" 
        value={`$${hourlyRate.toFixed(2)}`} 
        type="rate"
      />
      <StatCard
        label="Total Cost"
        value={`$${costs.totalCost.toFixed(2)}`}
        type="cost"
      />
      <StatCard
        label="Total Hours"
        value={costs.totalHours}
        type="hours"
      />
    </div>
  </div>
);

const StatCard = ({ label, value, type }) => (
  <div className={`stat-card ${type || ''}`}>
    <h3>{label}</h3>
    <div className="stat-value">{value}</div>
  </div>
);

const FiltersSidebar = ({ filters, onFilterChange, searchQuery, setSearchQuery, loading }) => (
  <div className="filters-sidebar">
    <div className="search-box">
      <input
        type="text"
        placeholder="Search requirements..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        disabled={loading}
      />
      {loading && <div className="search-spinner" />}
    </div>

    {['type', 'status', 'complexity', 'priority'].map((filterType) => (
      <FilterGroup
        key={filterType}
        type={filterType}
        options={
          filterType === 'type' ? ['Functional', 'Non-Functional', 'UI', 'Security', 'Performance'] :
          filterType === 'status' ? ['Draft', 'Review', 'Approved', 'Disapproved'] :
          filterType === 'complexity' ? ['Low', 'Moderate', 'High'] :
          ['Low', 'Medium', 'High']
        }
        selected={filters[filterType]}
        onChange={onFilterChange}
      />
    ))}
  </div>
);

const FilterGroup = ({ type, options, selected, onChange }) => (
  <div className="filter-group">
    <h4>{type.charAt(0).toUpperCase() + type.slice(1)}</h4>
    {options.map(option => (
      <label key={option} className="filter-option">
        <input
          type="checkbox"
          checked={selected.includes(option)}
          onChange={() => onChange(type, option)}
        />
        <span>{option}</span>
      </label>
    ))}
  </div>
);

const RequirementCard = ({ requirement, onPushToJira, jiraConnected, hourlyRate }) => {
  const cost = (requirement.estimated_time || 0) * hourlyRate;
  
  return (
    <div className="requirement-card">
      <div className="card-header">
        <span className="requirement-id">ID: {requirement.id.slice(-6)}</span>
        <span className={`status-badge ${requirement.status.toLowerCase()}`}>
          {requirement.status}
        </span>
        <span className={`priority-tag ${requirement.priority.toLowerCase()}`}>
          {requirement.priority}
        </span>
      </div>
      <p className="requirement-text">{requirement.requirement}</p>
      <div className="card-footer">
        <div className="cost-details">
          <span className="cost-item">
            <span className="cost-label">Hours:</span>
            <span className="cost-value">{requirement.estimated_time}h</span>
          </span>
          <span className="cost-item">
            <span className="cost-label">Rate:</span>
            <span className="cost-value">${hourlyRate.toFixed(2)}/h</span>
          </span>
          <span className="cost-item">
            <span className="cost-label">Total:</span>
            <span className="cost-value">${cost.toFixed(2)}</span>
          </span>
        </div>
        <div className="metadata">
          <span className="complexity-badge">{requirement.complexity} complexity</span>
          <span className="author-date">
            {requirement.author} • {new Date(requirement.date).toLocaleDateString()}
          </span>
          {requirement.status === 'Approved' && (
            <button
              className="jira-push-button"
              onClick={() => onPushToJira(requirement.id)}
              disabled={!jiraConnected}
              title={jiraConnected ? "Push to Jira" : "Connect to Jira first"}
            >
              Push to Jira
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const PaginationControls = ({ pagination, onPageChange }) => (
  <div className="pagination-controls">
    <button
      onClick={() => onPageChange(prev => ({ ...prev, page: prev.page - 1 }))}
      disabled={pagination.page === 1}
    >
      Previous
    </button>
    
    <span>
      Page {pagination.page} of {pagination.pages}
      {pagination.total > 0 && (
        <span className="total-items"> ({pagination.total} total items)</span>
      )}
    </span>

    <button
      onClick={() => onPageChange(prev => ({ ...prev, page: prev.page + 1 }))}
      disabled={pagination.page === pagination.pages}
    >
      Next
    </button>
  </div>
);

export default Dashboard;