import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Popconfirm, Card, Modal, App, Breadcrumb, Typography, message as antMessage } from 'antd';
import { EditOutlined, DeleteOutlined, HomeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/api';
import { useAuthStore } from '../../../store/authStore';
import moment from 'moment';
import MomCreationForm from './MomCreationForm';
import PageLayout from '../../../components/ui/PageLayout';
import { usePermissionControl } from '../../../hooks/usePermissionControl';
import PermissionRequestModal from '../../../components/permissions/PermissionRequestModal';

const { Title } = Typography;

interface Mom {
  id: number;
  title: string;
  agenda: string;
  meeting_datetime: string;
  scheduled_by: number;
  status?: string;
  can_edit?: boolean;
  can_delete?: boolean;
  participants_count?: number;
}

interface ApiResponse {
  results?: Mom[];
  [key: string]: any;
}

const MomList: React.FC = () => {
  const [moms, setMoms] = useState<Mom[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const navigate = useNavigate();

  const message = antMessage;
  const {
    showPermissionModal,
    permissionRequest,
    executeWithPermission,
    closePermissionModal,
    onPermissionRequestSuccess
  } = usePermissionControl();

  // --- Auto-Navigation Logic ---
  const handlePaginationChange = React.useCallback((page: number, size: number) => {
    setCurrentPage(page);
    setPageSize(size);
  }, []);


  const fetchMoms = async (navigateToNewItem = false) => {
    setLoading(true);
    try {
      const response = await api.get<Mom[] | ApiResponse>('/api/v1/mom/list/');
      console.log('MOM list response:', response.data);

      // Handle different response formats
      let responseData: Mom[];
      if (Array.isArray(response.data)) {
        responseData = response.data;
      } else if (response.data && typeof response.data === 'object' && 'results' in response.data && Array.isArray(response.data.results)) {
        responseData = response.data.results;
      } else {
        responseData = [];
      }

      const momsWithStatus = responseData.map(mom => {
        if (mom?.status) {
          return mom;
        }
        const now = moment();
        const meetingTime = moment(mom?.meeting_datetime);
        return { ...mom, status: now.isBefore(meetingTime) ? 'scheduled' : 'live' };
      });

      if (navigateToNewItem && momsWithStatus.length > 0) {
        const newItemPage = Math.ceil(momsWithStatus.length / pageSize);
        setCurrentPage(newItemPage);
      }

      setMoms(momsWithStatus);
    } catch (error: any) {
      console.error('MOM list fetch error:', error?.response?.status, error?.response?.data);
      if (error?.response?.status !== 401) {
        message.error('Failed to fetch meeting list.');
      }
      setMoms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMoms();
  }, []);

  const handleView = (id: number) => {
    navigate(`/app/mom/view/${id}`);
  };

  const handleEdit = async (mom: Mom) => {
    await executeWithPermission(
      () => {
        navigate(`/app/mom/edit/${mom.id}`);
        return Promise.resolve();
      },
      'edit meeting'
    );
  };

  const handleDelete = async (mom: Mom) => {
    
    await executeWithPermission(
      async () => {
        await api.delete(`/api/v1/mom/${mom.id}/delete/`);

        // Check if we need to adjust current page after deletion
        const newDataLength = moms.length - 1;
        const maxPage = Math.ceil(newDataLength / pageSize);
        if (currentPage > maxPage && maxPage > 0) {
          setCurrentPage(maxPage);
        }

        message.success('Meeting deleted successfully.');
        fetchMoms();
      },
      'delete meeting'
    );
  };

  const handleSchedule = () => {
    setIsModalVisible(true);
  };

  const handleLive = (id: number) => {
    navigate(`/app/mom/live/${id}`);
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
  };

  const handleFormSuccess = (newMeeting?: Mom) => {
    setIsModalVisible(false);
    if (newMeeting) {
      // Immediately prepend the new meeting so the list updates without a round-trip
      setMoms(prev => [newMeeting, ...prev]);
    }
    // Also refresh from server to get accurate data
    fetchMoms(true);
  };

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => text || 'N/A',
    },
    {
      title: 'Agenda',
      dataIndex: 'agenda',
      key: 'agenda',
      render: (text: string) => text || 'N/A',
    },
    {
      title: 'Meeting Date & Time',
      dataIndex: 'meeting_datetime',
      key: 'meeting_datetime',
      render: (text: string) => text ? moment(text).format('YYYY-MM-DD HH:mm') : 'N/A',
    },
    {
      title: 'Participants',
      dataIndex: 'participants_count',
      key: 'participants_count',
      render: (count: number) => count ?? 0,
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, record: Mom) => {
        if (!record) return 'N/A';
        
        // Assuming record has a 'status' field that can be 'live' or 'complete'
        if (record.status === 'completed') {
          return (
            <Button type="primary" disabled>
              Live
            </Button>
          );
        }
        
        if (!record.meeting_datetime) {
          return <span style={{ color: '#999' }}>No Date Set</span>;
        }
        
        const now = moment();
        const meetingTime = moment(record.meeting_datetime);

        // Show different states based on timing
        if (now.isBefore(meetingTime)) {
          const timeUntilMeeting = meetingTime.diff(now, 'minutes');
          if (timeUntilMeeting > 60) {
            return <span style={{ color: '#1890ff' }}>Scheduled</span>;
          } else {
            return <span style={{ color: '#faad14' }}>Starting Soon ({timeUntilMeeting}m)</span>;
          }
        } else {
          // Meeting time has arrived or passed - show Live button
          return (
            <Button type="primary" onClick={() => handleLive(record.id)}>
              Live
            </Button>
          );
        }
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Mom) => {
        if (!record) return null;
        
        return (
          <Space size="middle">
            <Button type="link" onClick={() => handleView(record.id)}>
              View
            </Button>
            {record.can_edit && (
              <Button 
                type="link" 
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              >
                Edit
              </Button>
            )}
            {record.can_delete && (
              <Popconfirm
                title="Are you sure to delete this meeting?"
                onConfirm={() => handleDelete(record)}
                okText="Yes"
                cancelText="No"
              >
                <Button 
                  type="link" 
                  danger
                  icon={<DeleteOutlined />}
                >
                  Delete
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div className="space-y-6" style={{ paddingTop: 80 }}>
      <Breadcrumb 
        style={{ marginBottom: 16 }}
        items={[
          {
            title: (
              <a href="/app" style={{ color: 'inherit', textDecoration: 'none' }}>
                <HomeOutlined />
              </a>
            )
          },
          {
            title: 'MOM'
          }
        ]}
      />
      <div className="flex flex-wrap justify-between items-center gap-4">
        <Title level={3} className="!mb-0 !text-color-text-base">Minutes of Meeting</Title>
        <Button type="primary" onClick={handleSchedule}>
          Add Meeting
        </Button>
      </div>
      <Card variant="borderless">
        <Table
          columns={columns}
          dataSource={moms}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: moms.length,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} meetings`,
            placement: 'bottomRight',
            onChange: handlePaginationChange,
            onShowSizeChange: handlePaginationChange,
            pageSizeOptions: ['5', '10', '20', '50'],
          }}
          scroll={{ x: 800 }}
        />
      <Modal
        title="Schedule New Meeting"
        open={isModalVisible}
        onCancel={handleModalCancel}
        footer={null}
        destroyOnHidden
        width={700}
      >
        <MomCreationForm onFinishSuccess={handleFormSuccess} onCancel={handleModalCancel} />
      </Modal>
      
      {permissionRequest && (
        <PermissionRequestModal
          visible={showPermissionModal}
          onCancel={closePermissionModal}
          onSuccess={onPermissionRequestSuccess}
          permissionType={permissionRequest.permissionType}
          objectId={permissionRequest.objectId}
          contentType={permissionRequest.contentType}
          objectName={permissionRequest.objectName}
        />
      )}
      </Card>
    </div>
  );
};

export default MomList;
