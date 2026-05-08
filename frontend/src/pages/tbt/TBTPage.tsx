import React, { useState, useCallback } from 'react';
import { Button, Tabs } from 'antd';
import { PlusOutlined, DashboardOutlined, UnorderedListOutlined } from '@ant-design/icons';
import TBTLanding from './TBTLanding';
import TBTList from './components/TBTList';
import TBTForm from './components/TBTForm';
import TBTDetail from './components/TBTDetail';

type View = 'dashboard' | 'list' | 'form' | 'detail';

const TBTPage: React.FC = () => {
  const [view, setView] = useState<View>('list');
  const [editingTbt, setEditingTbt] = useState<any>(null);
  const [viewingTbt, setViewingTbt] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => setRefreshTrigger(n => n + 1), []);

  const handleCreate = useCallback(() => {
    setEditingTbt(null);
    setView('form');
  }, []);

  const handleEdit = useCallback((tbt: any) => {
    setEditingTbt(tbt);
    setView('form');
  }, []);

  const handleView = useCallback((tbt: any) => {
    setViewingTbt(tbt);
    setView('detail');
  }, []);

  const handleFormSuccess = useCallback((tbt: any) => {
    setEditingTbt(null);
    refresh();
    // After create/edit, show the detail view
    setViewingTbt(tbt);
    setView('detail');
  }, [refresh]);

  const handleFormCancel = useCallback(() => {
    setEditingTbt(null);
    setView('list');
  }, []);

  const handleDetailBack = useCallback(() => {
    setViewingTbt(null);
    setView('list');
    refresh();
  }, [refresh]);

  const handleDetailRefresh = useCallback((updatedTbt: any) => {
    setViewingTbt(updatedTbt);
    refresh();
  }, [refresh]);

  const handleComplete = useCallback((tbt: any) => {
    setViewingTbt(tbt);
    setView('detail');
  }, []);

  // Detail view
  if (view === 'detail' && viewingTbt) {
    return (
      <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
        <TBTDetail
          tbt={viewingTbt}
          onBack={handleDetailBack}
          onEdit={handleEdit}
          onRefresh={handleDetailRefresh}
        />
      </div>
    );
  }

  // Form view
  if (view === 'form') {
    return (
      <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{editingTbt ? 'Edit TBT' : 'Create New TBT'}</h2>
        </div>
        <TBTForm
          tbtId={editingTbt?.id ?? null}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

  // Dashboard / List tabs
  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Toolbox Talk (TBT)</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Create TBT
        </Button>
      </div>

      <Tabs
        activeKey={view}
        onChange={v => setView(v as View)}
        items={[
          {
            key: 'dashboard',
            label: <span><DashboardOutlined /> Dashboard</span>,
            children: <TBTLanding />,
          },
          {
            key: 'list',
            label: <span><UnorderedListOutlined /> All TBTs</span>,
            children: (
              <TBTList
                onView={handleView}
                onEdit={handleEdit}
                onComplete={handleComplete}
                refreshTrigger={refreshTrigger}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

export default TBTPage;
