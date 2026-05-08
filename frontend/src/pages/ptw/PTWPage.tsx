import React, { useState, useCallback } from 'react';
import { Tabs, Button, Modal } from 'antd';
import { PlusOutlined, DashboardOutlined, UnorderedListOutlined } from '@ant-design/icons';
import PTWLandingPage from './PTWLandingPage';
import PermitList from './components/PermitList';
import SinglePagePermitForm from './components/SinglePagePermitForm';
import * as Types from './types';

const PTWPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [editingPermitId, setEditingPermitId] = useState<number | null>(null);
  const [viewingPermit, setViewingPermit] = useState<Types.Permit | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const handleCreatePermit = useCallback(() => {
    setEditingPermitId(null);
    setActiveTab('form');
  }, []);

  const handleEditPermit = useCallback((permit: Types.Permit) => {
    setEditingPermitId(permit.id);
    setActiveTab('form');
  }, []);

  const handleViewPermit = useCallback((permit: Types.Permit) => {
    setViewingPermit(permit);
  }, []);

  const handleFormSuccess = useCallback(() => {
    setEditingPermitId(null);
    setListRefreshKey(k => k + 1);
    setActiveTab('list');
  }, []);

  const handleFormCancel = useCallback(() => {
    setEditingPermitId(null);
    setActiveTab('list');
  }, []);

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Permit to Work (PTW)</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreatePermit}>
          Create Permit
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'dashboard',
            label: (
              <span>
                <DashboardOutlined />
                Dashboard
              </span>
            ),
            children: <PTWLandingPage />
          },
          {
            key: 'list',
            label: (
              <span>
                <UnorderedListOutlined />
                All Permits
              </span>
            ),
            children: <PermitList onViewPermit={handleViewPermit} onEditPermit={handleEditPermit} refreshKey={listRefreshKey} />
          },
          {
            key: 'form',
            label: editingPermitId ? 'Edit Permit' : 'Create Permit',
            children: (
              <SinglePagePermitForm
                permitId={editingPermitId}
                onSuccess={handleFormSuccess}
                onCancel={handleFormCancel}
              />
            )
          }
        ]}
      />

      <Modal
        title={`Permit: ${viewingPermit?.permit_number}`}
        open={!!viewingPermit}
        onCancel={() => setViewingPermit(null)}
        footer={[
          <Button key="close" onClick={() => setViewingPermit(null)}>Close</Button>,
          <Button key="edit" type="primary" onClick={() => {
            if (viewingPermit) {
              handleEditPermit(viewingPermit);
              setViewingPermit(null);
            }
          }}>Edit</Button>
        ]}
        width={800}
      >
        {viewingPermit && (
          <div>
            <p><strong>Type:</strong> {viewingPermit.permit_type_details?.name}</p>
            <p><strong>Status:</strong> {viewingPermit.status}</p>
            <p><strong>Location:</strong> {viewingPermit.location}</p>
            <p><strong>Planned Start:</strong> {viewingPermit.planned_start_time}</p>
            <p><strong>Planned End:</strong> {viewingPermit.planned_end_time}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PTWPage;
