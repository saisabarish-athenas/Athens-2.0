import React, { useState, useEffect } from 'react';
import { Card, Typography, Spin, Form, Input, Button, Checkbox, DatePicker, Select, Modal, Table, App, Avatar, List } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../../lib/api';
import moment from 'moment';
import { useNotificationsContext } from '../../../common/contexts/NotificationsContext';
// import type { NotificationType } from '../../../common/utils/webSocketNotificationService'; // Unused import
import { useTheme } from '../../../contexts/ThemeContext';
import PageLayout from '../../../components/ui/PageLayout';
import MomWorkflowSummary from './MomWorkflowSummary';
import { useAuthStore } from '../../../store/authStore';
import { enqueueAttendanceEvent, generateClientEventId, getAttendanceDeviceId } from '../../../shared/offline/attendanceQueue';
import MomAttendancePanel from './MomAttendancePanel';

const { Title, Paragraph } = Typography;
const { Option } = Select;

interface Participant {
  id: number;
  name: string;
  email: string;
  username?: string; // Added missing property
  status: 'accepted' | 'rejected' | 'pending' | 'noresponse' | string;
  attended: boolean;
  designation?: string;
  company_name?: string;
  specimen_signature?: string;
  signature?: string;
  signature_template?: string; // Digital signature template URL
  user_type?: string;
  admin_type?: string; // Added missing property
  department?: string; // Added missing property
}

interface MomLiveData {
  id: number;
  title: string;
  agenda: string;
  meeting_datetime: string;
  points_to_discuss: string;
  participants: Participant[];
  status?: string;
  scheduled_by_id?: number;
}

interface PointItem {
  id: number;
  point: string;
  dueDate: string; // ISO string
  responsibleId: number;
  responsibleName: string;
}

// Helper component to render an image with a fallback text if the image fails to load or src is not provided
const SignatureImage: React.FC<{
  src?: string;
  alt: string;
  style: React.CSSProperties;
  fallbackText: string;
  clickable?: boolean;
}> = ({ src, alt, style, fallbackText, clickable = false }) => {
  const [imgError, setImgError] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => {
    setImgError(false); // Reset error state if src changes
  }, [src]);

  if (imgError || !src) {
    // Render fallback text using Ant Design Typography for consistent styling
    return <Typography.Text type="secondary">{fallbackText}</Typography.Text>;
  }

  const imageElement = (
    <img
      src={src}
      alt={alt}
      style={{
        ...style,
        cursor: clickable ? 'pointer' : 'default',
        transition: clickable ? 'transform 0.2s ease' : 'none',
        border: clickable ? '1px solid #d9d9d9' : 'none',
        borderRadius: clickable ? '4px' : '0'
      }}
      onError={() => setImgError(true)}
      onClick={clickable ? () => setPreviewVisible(true) : undefined}
      title={clickable ? 'Click to view full size' : alt}
      onMouseEnter={clickable ? (e) => {
        e.currentTarget.style.transform = 'scale(1.05)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      } : undefined}
      onMouseLeave={clickable ? (e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'none';
      } : undefined}
    />
  );

  return (
    <>
      {imageElement}
      {clickable && (
        <Modal
          title={`${alt} - Full Size`}
          open={previewVisible}
          onCancel={() => setPreviewVisible(false)}
          footer={[
            <Button key="close" onClick={() => setPreviewVisible(false)}>
              Close
            </Button>
          ]}
          width="auto"
          style={{ maxWidth: '90vw' }}
          centered
        >
          <div style={{ textAlign: 'center', maxHeight: '70vh', overflow: 'auto' }}>
            <img
              src={src}
              alt={alt}
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                border: '1px solid #f0f0f0',
                borderRadius: '4px'
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
};


const MomLive: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [momLiveData, setMomLiveData] = useState<MomLiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { effectiveTheme } = useTheme();

  const { message } = App.useApp();

  // New state for points list
  const [pointsList, setPointsList] = useState<PointItem[]>([]);
  // New state for new point inputs
  const [newPoint, setNewPoint] = useState<string>('');
  const [newDueDate, setNewDueDate] = useState<moment.Moment | null>(null);
  const [newResponsibleId, setNewResponsibleId] = useState<number | null>(null);

  // State for modal visibility and user list for adding participants
const [addParticipantModalVisible, setAddParticipantModalVisible] = useState(false);
const [availableUsers, setAvailableUsers] = useState<Participant[]>([]);
const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);

const [allAdminUsers, setAllAdminUsers] = useState<Participant[]>([]);
const [filteredAdminUsers, setFilteredAdminUsers] = useState<Participant[]>([]);
const [responsibleSearchText, setResponsibleSearchText] = useState<string>('');
const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);

// Get logged-in user from auth store
const loggedInUserId = useAuthStore(state => state.user?.id);
const { sendNotification } = useNotificationsContext();

const fetchAllAdminUsers = async () => {
  setLoadingAdminUsers(true);
  try {
    // Use the workforce participants endpoint — returns User IDs valid for MOM M2M
    const response = await api.get('/api/workforce/employees/participants/');
    const raw = Array.isArray(response.data) ? response.data : (response.data?.results ?? []);
    const allUsers: Participant[] = raw.map((u: any) => ({
      id: u.id,
      name: (u.full_name || u.name || u.username || '').trim(),
      email: u.email || '',
      username: u.username || '',
      status: 'pending',
      attended: false,
      department: u.department || '',
      designation: u.designation || '',
      company_name: u.company_name || '',
      admin_type: u.admin_type || '',
    }));
    const filteredUsers = allUsers.filter((u) => u.id !== loggedInUserId);
    setAllAdminUsers(filteredUsers);
    setFilteredAdminUsers(filteredUsers);
  } catch (error) {
    // Show error only once — do not retry automatically
    message.error('Could not load user list for participant selection.');
  } finally {
    setLoadingAdminUsers(false);
  }
};

useEffect(() => {
  const fetchMomLiveData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await api.get(`/api/v1/mom/${id}/live/`);

      // Fetch signature templates for participants
      const participantsWithTemplates = await fetchParticipantSignatureTemplates(response.data.participants);

      const updatedMomData = {
        ...response.data,
        participants: participantsWithTemplates
      };

      setMomLiveData(updatedMomData);

      // Initialize pointsList from points_to_discuss if possible
      // Assuming points_to_discuss is a JSON string of points array or fallback to empty
      let initialPoints: PointItem[] = [];
      try {
        initialPoints = JSON.parse(response.data.points_to_discuss);
        if (!Array.isArray(initialPoints)) initialPoints = [];
      } catch {
        initialPoints = [];
      }
      setPointsList(initialPoints);
    } catch (error) {
      message.error('Failed to load live meeting data.');
    } finally {
      setLoading(false);
    }
  };
  fetchMomLiveData();
  fetchAllAdminUsers();
}, [id]);

useEffect(() => {
  if (!momLiveData) return;

  form.setFieldsValue({
    points_to_discuss: momLiveData.points_to_discuss || '',
    participants: momLiveData.participants.map((p: any) => ({
      ...p,
      attended: p.attended || false,
    })),
  });
}, [form, momLiveData]);



  const fetchAvailableUsers = async () => {
    try {
      // Check if admin users are loaded
      if (allAdminUsers.length === 0) {
        await fetchAllAdminUsers();
      }

      // Use the already loaded admin users instead of making another API call
      const existingParticipantIds = momLiveData?.participants.map(p => p.id) || [];
      const filteredUsers = allAdminUsers.filter((user: Participant) => !existingParticipantIds.includes(user.id));
      setAvailableUsers(filteredUsers);

    } catch (error) {
      message.error('Failed to load users to add as participants.');
    }
  };

  // Function to fetch signature template for a specific user
  const fetchUserSignatureTemplate = async (userId: number, userType: string, adminType?: string): Promise<string | null> => {
    try {
      let endpoint = '';
      const normalizedAdminType = adminType === 'master' || adminType === 'MASTER_ADMIN'
        ? 'masteradmin'
        : adminType;

      // Determine which endpoint to use based on user type
      if (userType === 'adminuser') {
        // For adminusers, use UserDetail signature template
        endpoint = '/authentication/signature/template/by-user/';
      } else if (userType === 'projectadmin' && normalizedAdminType !== 'masteradmin') {
        // For projectadmins (except master), use AdminDetail signature template
        endpoint = '/authentication/admin/signature/template/by-user/';
      } else {
        // Master admin or other types don't have signature templates
        return null;
      }

      const response = await api.get(endpoint, {
        params: { user_id: userId }
      });

      if (response.data.success && response.data.template_url) {
        return response.data.template_url;
      }
      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
      } else {
      }
      return null;
    }
  };

  // Function to fetch signature templates for all participants
  const fetchParticipantSignatureTemplates = async (participants: Participant[]) => {

    const updatedParticipants = await Promise.all(
      participants.map(async (participant) => {
        try {
          const signatureTemplate = await fetchUserSignatureTemplate(
            participant.id,
            participant.user_type || '',
            participant.admin_type
          );

          return {
            ...participant,
            signature_template: signatureTemplate
          };
        } catch (error) {
          return participant;
        }
      })
    );

    return updatedParticipants;
  };

  const openAddParticipantModal = async () => {
    setSelectedUserIds([]);
    setAddParticipantModalVisible(true);

    // Fetch available users after opening modal
    await fetchAvailableUsers();
  };

  const handleAddParticipants = async () => {
    if (!momLiveData) return;
    try {
      // Correct API endpoint to add participants to meeting
      await api.post(`/api/v1/mom/${id}/participants/add/`, {
        participant_ids: selectedUserIds,
      });
      // Refresh momLiveData from backend after adding participants
      const response = await api.get(`/api/v1/mom/${id}/live/`);
      setMomLiveData(response.data);
      message.success('Participants added successfully.');
      setAddParticipantModalVisible(false);
    } catch (error) {
      message.error('Failed to add participants.');
    }
  };

  const handleStartMeeting = async () => {
    if (!id) return;
    try {
      const res = await api.post(`/api/v1/mom/${id}/start/`);
      setMomLiveData(prev => prev ? { ...prev, status: 'live' } : prev);
      message.success('Meeting is now LIVE! Attendance is open.');
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to start meeting.');
    }
  };

  const handleCompleteMeeting = async () => {
    if (!id || !momLiveData) return;
    setSubmitting(true);
    try {
      // Get current attendance values from the form
      const formValues = form.getFieldsValue();
      const attendanceUpdates = momLiveData.participants.map(p => ({
        id: p.id,
        attended: formValues[`attended_${p.id}`] || false,
      }));

      if (!navigator.onLine) {
        await Promise.all(
          attendanceUpdates
            .filter(att => att.attended)
            .map(att => enqueueAttendanceEvent({
              client_event_id: generateClientEventId(),
              module: 'MOM',
              module_ref_id: String(id),
              event_type: 'CHECK_IN',
              occurred_at: new Date().toISOString(),
              device_id: getAttendanceDeviceId(),
              offline: true,
              method: 'HOST',
              payload: {
                mom_id: id,
                participant_id: att.id,
                attended: true
              }
            }))
        );
        message.info('Attendance saved offline; will sync when online.');
        setSubmitting(false);
        return;
      }

      // 1. Update meeting points and attendance
      await api.put(`/api/v1/mom/${id}/live/attendance/`, {
        points_to_discuss: JSON.stringify(pointsList),
        attendance: attendanceUpdates,
        participants: momLiveData.participants.map(p => p.id),
      });
      message.success('Meeting details updated.');

      // 2. Mark meeting as complete
      const completedTime = new Date().toISOString();
      const startTime = momLiveData.meeting_datetime;
      const durationMs = new Date(completedTime).getTime() - new Date(startTime).getTime();
      const durationMinutes = Math.floor(durationMs / 60000);

      const completeResponse = await api.put(`/api/v1/mom/${id}/complete/`, { // Ensure this endpoint updates the MoM status to 'complete'
        completed_at: completedTime,
        duration_minutes: durationMinutes,
      });

      // Send completion notifications to all participants
      for (const participant of momLiveData.participants) {
        try {
          await sendNotification(participant.id, {
            title: 'Meeting Completed',
            message: `The meeting "${momLiveData.title}" has been completed.`,
            type: 'meeting_completed',
            data: {
              momId: id,
              meetingTitle: momLiveData.title,
              completedAt: completedTime,
              duration: durationMinutes
            }
          });
        } catch (notifError) {
        }
      }

      message.success('Meeting marked as completed.');
      navigate('/app/mom');
    } catch (error) {
      message.error('Failed to update or complete the meeting.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPoint = async () => {
    if (!newPoint.trim()) { message.error('Please enter a point.'); return; }
    if (!newDueDate) { message.error('Please select a due date.'); return; }
    if (!newResponsibleId) { message.error('Please select a responsible person.'); return; }
    const responsible = allAdminUsers.find(p => p.id === newResponsibleId);
    if (!responsible) { message.error('Selected responsible person is invalid.'); return; }
    const newItem: PointItem = {
      id: Date.now(),
      point: newPoint.trim(),
      dueDate: newDueDate.toISOString(),
      responsibleId: newResponsibleId,
      responsibleName: responsible.name || responsible.username || 'Unknown',
    };
    setPointsList(prev => [...prev, newItem]);

    // Backend will handle task assignment notifications
  message.success(`Task assigned to ${responsible.name || responsible.username}.`);
    // Clear inputs
    setNewPoint('');
    setNewDueDate(null);
    setNewResponsibleId(null);
  };

  const handleDeletePoint = (id: number) => {
    setPointsList(prev => prev.filter(item => item.id !== id));
  };

  // Handle search for responsible person
  const handleResponsibleSearch = (searchText: string) => {
    setResponsibleSearchText(searchText);
    if (!searchText.trim()) {
      setFilteredAdminUsers(allAdminUsers);
      return;
    }

    const filtered = allAdminUsers.filter(user =>
      user.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchText.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchText.toLowerCase()) ||
      user.department?.toLowerCase().includes(searchText.toLowerCase()) ||
      user.designation?.toLowerCase().includes(searchText.toLowerCase()) ||
      user.company_name?.toLowerCase().includes(searchText.toLowerCase())
    );

    setFilteredAdminUsers(filtered);
  };

  if (loading) {
    return (
      <PageLayout
        title="Live Meeting"
        subtitle="Conducting live meeting session"
        breadcrumbs={[
          { title: 'MOM', href: '/app/mom' },
          { title: 'Live Meeting' }
        ]}
      >
        <div className="flex justify-center items-center min-h-64">
          <Spin description="Loading live meeting data..." size="large" />
        </div>
      </PageLayout>
    );
  }

  if (!momLiveData) {
    return (
      <PageLayout
        title="Live Meeting"
        subtitle="Meeting not found"
        breadcrumbs={[
          { title: 'MOM', href: '/app/mom' },
          { title: 'Live Meeting' }
        ]}
      >
        <Card className={`theme-card ${effectiveTheme === 'dark' ? 'dark-theme' : 'light-theme'}`}>
          <Title level={4}>Meeting Not Found</Title>
          <Paragraph>The requested live meeting data could not be found.</Paragraph>
        </Card>
      </PageLayout>
    );
  }

  // Filter participants by status
  const acceptedParticipants = momLiveData.participants.filter(p => p.status === 'accepted');
  const noResponseParticipants = momLiveData.participants.filter(p => p.status === 'pending' || p.status === 'noresponse' || p.status === 'rejected');

  return (
    <PageLayout
      title={`Live Meeting: ${momLiveData.title}`}
      subtitle="Conducting live meeting session"
      breadcrumbs={[
        { title: 'MOM', href: '/app/mom' },
        { title: 'Live Meeting' }
      ]}
    >
      <Card
        className={`theme-card ${effectiveTheme === 'dark' ? 'dark-theme' : 'light-theme'}`}
        style={{ border: 'none' }}
      >
      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
        Live Meeting: {momLiveData.title}
      </Title>
      <Paragraph><strong>Agenda:</strong> {momLiveData.agenda}</Paragraph>
      <Paragraph><strong>Meeting Date &amp; Time:</strong> {new Date(momLiveData.meeting_datetime).toLocaleString()}</Paragraph>

      {/* Workflow Summary */}
      <MomWorkflowSummary
        participants={momLiveData.participants}
        meetingStatus={(momLiveData.status as 'live' | 'scheduled' | 'completed' | 'cancelled') || 'scheduled'}
        meetingDateTime={momLiveData.meeting_datetime}
        title={momLiveData.title}
      />

      <Title level={4} style={{ marginTop: 20, marginBottom: 10 }}>Accepted Participants</Title>
      <Table
        size="small"
        bordered
        dataSource={acceptedParticipants}
        rowKey="id"
        pagination={false}
        style={{ marginBottom: 24 }}
        locale={{ emptyText: 'No participants have accepted the invitation yet.' }}
        columns={[
          {
            title: 'Name / Email', key: 'info',
            render: (_: any, item: Participant) => (
              <Typography.Text>{item.name} ({item.email})</Typography.Text>
            ),
          },
          {
            title: 'Action', key: 'action', width: 80,
            render: (_: any, item: Participant) => (
              <Button type="link" danger onClick={() => {
                if (!momLiveData) return;
                setMomLiveData({ ...momLiveData, participants: momLiveData.participants.filter(p => p.id !== item.id) });
                message.success(`Participant ${item.name} removed.`);
              }}>Remove</Button>
            ),
          },
        ]}
      />

      <Title level={4} style={{ marginTop: 20, marginBottom: 10, color: '#faad14' }}>
        No Response ({noResponseParticipants.length})
      </Title>
      <Table
        size="small"
        bordered
        dataSource={noResponseParticipants}
        rowKey="id"
        pagination={false}
        style={{ marginBottom: 24 }}
        locale={{ emptyText: 'All participants have responded to the invitation.' }}
        columns={[
          {
            title: 'Name / Email', key: 'info',
            render: (_: any, item: Participant) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar style={{ backgroundColor: '#faad14' }}>{(item.name || item.email || 'U').charAt(0).toUpperCase()}</Avatar>
                <div>
                  <Typography.Text>{item.name} ({item.email})</Typography.Text>
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {item.company_name && `Company: ${item.company_name}`}
                  </Typography.Text>
                </div>
              </div>
            ),
          },
        ]}
      />

      <Button
        type="primary"
        onClick={() => {
          openAddParticipantModal();
        }}
        style={{ marginBottom: 24 }}
        loading={loadingAdminUsers}
      >
        Add Participant
      </Button>

      <Modal
        title="Add Participants"
        open={addParticipantModalVisible}
        onOk={handleAddParticipants}
        onCancel={() => setAddParticipantModalVisible(false)}
        okText="Add Selected"
        okButtonProps={{ disabled: selectedUserIds.length === 0 }}
      >
        {loadingAdminUsers ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin description="Loading admin users..." />
          </div>
        ) : availableUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
            {allAdminUsers.length === 0 ? (
              <div>
                <p>No admin users found.</p>
                <Button onClick={fetchAllAdminUsers} type="link">
                  Retry Loading Users
                </Button>
              </div>
            ) : (
              <p>All admin users are already participants in this meeting.</p>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--color-ui-hover)', borderRadius: 6 }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                <strong>Available Users:</strong> {availableUsers.length} users can be added as participants
                <br />
                <strong>Total Admin Users:</strong> {allAdminUsers.length} loaded
              </Typography.Text>
            </div>
            <List
              dataSource={availableUsers}
              renderItem={user => (
            <div key={user.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <Checkbox
                checked={selectedUserIds.includes(user.id)}
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedUserIds(prev => [...prev, user.id]);
                  } else {
                    setSelectedUserIds(prev => prev.filter(id => id !== user.id));
                  }
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontWeight: 'bold' }}>
                    {user.name || user.username}
                    {user.admin_type && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>
                        ({user.admin_type})
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {user.email}
                    {user.department && ` • ${user.department}`}
                    {user.designation && ` • ${user.designation}`}
                  </div>
                  {user.company_name && (
                    <div style={{ fontSize: '11px', color: '#999' }}>{user.company_name}</div>
                  )}
                </div>
              </Checkbox>
            </div>
          )}
        />
          </>
        )}
      </Modal>



      <Form form={form} layout="vertical">
        {/* Remove old points_to_discuss textarea */}
        {/* <Form.Item label="Points to Discuss" name="points_to_discuss" rules={[{ required: true, message: 'Please enter points to discuss' }]}>
          <Input.TextArea rows={4} />
        </Form.Item> */}

        {/* Admin users statistics */}
        {allAdminUsers.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--color-ui-hover)', borderRadius: 6 }}>
            <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
              <strong>Available Users:</strong> {allAdminUsers.length} admin users loaded
              {allAdminUsers.length > 0 && (
                <>
                  <br />
                  <strong>User Types:</strong> {
                    [
                      ...new Set(
                        allAdminUsers.map(user => user.admin_type || 'unknown')
                      )
                    ].join(', ')
                  }
                </>
              )}
            </Typography.Text>
          </div>
        )}

        {/* New input fields for point, due date, responsible person */}
        <Form.Item label="Add Point to Discuss">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <Input.TextArea
              rows={2}
              placeholder="Enter point to discuss"
              value={newPoint}
              onChange={e => setNewPoint(e.target.value)}
            />
            <DatePicker
              style={{ width: '100%' }}
              placeholder="Select due date"
              value={newDueDate}
              onChange={date => setNewDueDate(date)}
            />
            <Select
              showSearch
              placeholder="Search and select responsible person"
              value={newResponsibleId}
              onChange={value => setNewResponsibleId(value)}
              onSearch={handleResponsibleSearch}
              style={{ width: '100%' }}
              allowClear
              filterOption={false} // Disable default filtering since we handle it manually
              notFoundContent={filteredAdminUsers.length === 0 ? 'No users found' : null}
              popupRender={(menu) => (
                <div>
                  <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fafafa' }}>
                    <Input
                      placeholder="Search by name, email, department, company..."
                      value={responsibleSearchText}
                      onChange={e => handleResponsibleSearch(e.target.value)}
                      style={{ width: '100%' }}
                      allowClear
                    />
                  </div>
                  {menu}
                  {filteredAdminUsers.length > 0 && (
                    <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0', backgroundColor: '#fafafa', fontSize: '12px', color: '#666' }}>
                      Showing {filteredAdminUsers.length} of {allAdminUsers.length} users
                    </div>
                  )}
                </div>
              )}
            >
              {filteredAdminUsers.map(user => (
                <Option key={user.id} value={user.id} title={`${user.name || user.username} - ${user.department || 'No Department'} - ${user.company_name || 'No Company'}`}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontWeight: 'bold' }}>
                      {user.name || user.username}
                      {user.admin_type && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>
                          ({user.admin_type})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {user.email}
                      {user.department && ` • ${user.department}`}
                      {user.designation && ` • ${user.designation}`}
                    </div>
                    {user.company_name && (
                      <div style={{ fontSize: '11px', color: '#999' }}>
                        {user.company_name}
                      </div>
                    )}
                  </div>
                </Option>
              ))}
            </Select>
            <Button type="dashed" onClick={handleAddPoint} style={{ width: '100%' }}>
              Add
            </Button>
          </div>
        </Form.Item>

        <Form.Item label="Points List">
          <Table
            bordered
            size="small"
            dataSource={pointsList}
            rowKey="id"
            pagination={false}
            locale={{ emptyText: 'No points added yet' }}
            columns={[
              { title: 'Point', dataIndex: 'point', key: 'point' },
              { title: 'Due Date', dataIndex: 'dueDate', key: 'dueDate', width: 120,
                render: (d: string) => moment(d).format('YYYY-MM-DD') },
              { title: 'Responsible', dataIndex: 'responsibleName', key: 'responsibleName', width: 150 },
              { title: '', key: 'action', width: 80,
                render: (_: any, item: PointItem) => (
                  <Button type="link" danger onClick={() => handleDeletePoint(item.id)}>Delete</Button>
                ) },
            ]}
          />
        </Form.Item>

      {/* New table for selected participants */}
      <Table
        dataSource={momLiveData.participants}
        rowKey="id"
        pagination={false}
        style={{ marginBottom: 24 }}
        columns={[
          {
            title: 'Sl No',
            key: 'slno',
            render: (_text, _record, index) => index + 1,
            width: 60,
          },
          {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
          },
          {
            title: 'Company',
            dataIndex: 'company_name',
            key: 'company_name',
            render: (text: string) => text || 'N/A',
          },
          {
            title: 'Designation',
            dataIndex: 'designation',
            key: 'designation',
          },
          {
            title: 'Signature',
            dataIndex: 'signature',
            key: 'signature',
            render: (signatureUrl: string | undefined, record: Participant) => {
              // Prioritize signature template over regular signature
              const displaySignature = record.signature_template || signatureUrl;
              const signatureType = record.signature_template ? 'Template' : 'Manual';

              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <SignatureImage
                      src={displaySignature}
                      alt={`${record.name}'s Signature`}
                      style={{ height: 40, maxWidth: 120 }}
                      fallbackText="N/A"
                      clickable={!!displaySignature}
                    />
                    {displaySignature && (
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        background: 'rgba(0, 0, 0, 0.6)',
                        borderRadius: '50%',
                        width: '16px',
                        height: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        color: 'white'
                      }}>
                        <EyeOutlined />
                      </div>
                    )}
                  </div>
                  {displaySignature && (
                    <span style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                      {signatureType}
                    </span>
                  )}
                </div>
              );
            },
          },
        ]}
      />

      <Form.Item label="Participants Attendance">
          <Table
            dataSource={momLiveData.participants}
            rowKey="id"
            size="small"
            pagination={false}
            showHeader={false}
            columns={[
              {
                key: 'check',
                render: (_: any, participant: Participant) => (
                  <Form.Item
                    name={`attended_${participant.id}`}
                    valuePropName="checked"
                    noStyle
                    initialValue={participant.attended}
                  >
                    <Checkbox>
                      {participant.name} ({participant.email}) — Status: {participant.status}
                    </Checkbox>
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form.Item>

        <Form.Item>
          <MomAttendancePanel
            meetingId={id!}
            isCreator={!!(loggedInUserId && momLiveData.scheduled_by_id &&
              Number(loggedInUserId) === Number(momLiveData.scheduled_by_id))}
            meetingStatus={momLiveData.status || 'scheduled'}
            onMeetingStarted={() =>
              setMomLiveData(prev => prev ? { ...prev, status: 'live' } : prev)
            }
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" danger onClick={handleCompleteMeeting} loading={submitting} style={{ width: '100%' }}>
            Complete Meeting
          </Button>
        </Form.Item>
      </Form>
      </Card>
    </PageLayout>
  );
};

export default MomLive;

