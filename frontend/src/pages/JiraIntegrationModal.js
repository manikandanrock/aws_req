import React, { useState } from 'react';

const JiraIntegrationModal = ({ isOpen, onClose, onConnect }) => {
  const [jiraSettings, setJiraSettings] = useState({
    siteUrl: '',
    email: '',
    apiToken: '',
    projectKey: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setJiraSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent multiple submissions
    if (isLoading) return;

    setIsLoading(true);
    setError('');

    try {
      // Validate input fields
      if (!jiraSettings.siteUrl || !jiraSettings.email || !jiraSettings.apiToken || !jiraSettings.projectKey) {
        throw new Error('All fields are required.');
      }

      // Validate site URL format
      if (!jiraSettings.siteUrl.startsWith('http://') && !jiraSettings.siteUrl.startsWith('https://')) {
        throw new Error('Invalid site URL. Must start with http:// or https://');
      }

      // Debug: Log data before sending request
      console.log('Submitting Jira settings:', jiraSettings);

      const response = await fetch('http://localhost:5000/api/jira/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jiraSettings),
      });

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned an invalid response');
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to connect to Jira');
      }

      alert('Connected to Jira successfully!');
      onConnect(jiraSettings); // Pass the settings to the parent component
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Jira Integration</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Jira Site URL</label>
            <input
              type="text"
              name="siteUrl"
              value={jiraSettings.siteUrl}
              onChange={handleChange}
              placeholder="https://your-domain.atlassian.net"
              required
            />
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              name="email"
              value={jiraSettings.email}
              onChange={handleChange}
              placeholder="Email associated with your Atlassian account"
              required
            />
          </div>
          <div className="form-group">
            <label>API Token</label>
            <input
              type="password"
              name="apiToken"
              value={jiraSettings.apiToken}
              onChange={handleChange}
              placeholder="Your Jira API token"
              required
            />
          </div>
          <div className="form-group">
            <label>Jira Project Key</label>
            <input
              type="text"
              name="projectKey"
              value={jiraSettings.projectKey}
              onChange={handleChange}
              placeholder="Your Jira Project Key (e.g., PROJ)"
              required
            />
          </div>
          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={
                isLoading || 
                !jiraSettings.siteUrl || 
                !jiraSettings.email || 
                !jiraSettings.apiToken || 
                !jiraSettings.projectKey
              }
            >
              {isLoading ? 'Connecting...' : 'Connect to Jira'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JiraIntegrationModal;