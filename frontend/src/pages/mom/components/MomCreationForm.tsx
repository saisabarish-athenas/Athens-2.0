import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Select, Typography, Card, Spin, DatePicker, App, Tag, message as antMessage } from 'antd';
import moment from 'moment';
import type { Moment } from 'moment';
import api from '../../../lib/api';
import { useAuthStore } from '../../../store/authStore';
import { useTheme } from '../../../contexts/ThemeContext';
import { safeLog } from '../../../common/utils/logSanitizer';
import { useNotificationsContext } from '../../../common/contexts/NotificationsContext';
import { authGuard } from '../../../lib/authGuard';

const { Title } = Typography;
const { Option } = Select;

interface User {
  id: number;
  username: string;
  name?: string;
  email: string;
  department?: string;
  designation?: string;
  employee_code?: string;
}

interface Employee {
  id: number;
  name: string;
  employee_code: string;
  department?: string;
}

interface MomFormValues {
  title: string;
  agenda: string;
  participants_ids: number[];
  department?: string;
  meeting_datetime: Moment | null;
  location?: string;
}

interface MomCreationFormProps {
  onFinishSuccess?: (newMeeting?: any) => void;
  onCancel?: () => void;
}

const fixedDepartments = [
  { id: 1, name: 'Quality' },
  { id: 2, name: 'Safety' },
  { id: 3, name: 'Inventory' },
  { id: 4, name: 'Project/Execution' },
];

/** Build display label: "Name (code)" */
const userLabel = (u: User): string => {
  const name = (u.name || u.username || '').trim();
  const code = u.employee_code || String(u.id).padStart(2, '0');
  return `${name} (${code})`;
};

const MomCreationForm: React.FC<MomCreationFormProps> = ({ onFinishSuccess }) => {
  const [form] = Form.useForm();
  const user = useAuthStore((state) => state.user);
  const schedulerUsername = user?.username || user?.email || '';
  const schedulerUserId = user?.id;
  const schedulerUserType = user?.user_type;
  const schedulerAdminType = (user as any)?.admin_type;
  const companyType = (user as any)?.company_type || schedulerAdminType;

  const canScheduleMom = Boolean(
    user && (
      schedulerUserType === 'adminuser' ||
      (schedulerUserType === 'companyuser' && (
        ['client', 'epc', 'clientuser', 'epcuser', 'contractor'].includes(schedulerAdminType || '') ||
        (user as any)?.role_type === 'user'
      ))
    )
  );

  const { sendNotification } = useNotificationsContext();
  const [submitting, setSubmitting] = useState(false);
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [users, setUsers] = useState<Employee[]>([]);
  const [departmentFilters, setDepartmentFilters] = useState<string[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [participantsSearch, setParticipantsSearch] = useState('');
  const [selectedDateTime, setSelectedDateTime] = useState<moment.Moment | null>(null);
  const [notificationsSent, setNotificationsSent] = useState<Set<string>>(new Set());

  const { effectiveTheme } = useTheme();
  // Use static message API — reliable inside async callbacks
  const message = antMessage;

  const applyEmployeeFilters = (
    list: Employee[],
    departments: string[] = departmentFilters,
    search = participantsSearch
  ) => {
    const searchText = search?.trim().toLowerCase() ?? '';
    const departmentFiltersLower = departments.map((dept) => dept.toLowerCase());

    return list.filter((employee) => {
      const matchesDepartment =
        departmentFiltersLower.length === 0 ||
        departmentFiltersLower.some((filter) =>
          (employee.department || '').toLowerCase().includes(filter)
        );
      const matchesSearch =
        !searchText ||
        employee.name.toLowerCase().includes(searchText) ||
        employee.employee_code.toLowerCase().includes(searchText);
      return matchesDepartment && matchesSearch;
    });
  };

  const loadEmployees = async () => {
    if (employeesLoaded) return;
    setLoadingEmployees(true);
    try {
      const res = await api.get('/api/workforce/employees/participants/');
      const raw = Array.isArray(res.data) ? res.data : (res.data?.results ?? []);

      console.log('Employees API response:', raw);

      const mapped: Employee[] = raw.map((e: any) => ({
        id: e.id,
        name: (e.full_name || e.name || '').trim(),
        employee_code: String(e.employee_code || e.id).padStart(2, '0'),
        department:
          typeof e.department === 'object'
            ? e.department?.name
            : e.department || '',
      }));

      setEmployeesList(mapped);
      setUsers(applyEmployeeFilters(mapped, departmentFilters, participantsSearch));
      setEmployeesLoaded(true);

      if (mapped.length === 0) {
        safeLog.warn('MOM participants: no employees found');
      }
    } catch (err: any) {
      safeLog.error('MOM participants load failed', err);
      console.error('Participants API error:', err?.response?.status, err?.response?.data);
      message.error('Could not load participants. Please check your connection.');
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleParticipantsDropdownVisibleChange = (open: boolean) => {
    if (open) {
      loadEmployees();
    }
  };

  const handleParticipantsSearch = (value: string) => {
    setParticipantsSearch(value);
    setUsers(applyEmployeeFilters(employeesList, departmentFilters, value));
  };
  // ─────────────────────────────────────────────────────────────────────────

  // Function to get help text for date/time field
  const getDateTimeHelpText = () => {
    if (!selectedDateTime) {
      return "Select a future date and time (at least 1 minute ahead). Live button will appear when it's meeting time.";
    }

    const now = moment();
    const timeDiff = selectedDateTime.diff(now, 'minutes');

    // Only show positive help text for valid times
    if (timeDiff >= 1) {
      if (timeDiff < 60) {
        return `✅ Meeting scheduled for ${timeDiff} minutes from now. Live button will appear at meeting time.`;
      } else if (timeDiff < 1440) { // Less than 24 hours
        const hours = Math.floor(timeDiff / 60);
        const minutes = timeDiff % 60;
        return `✅ Meeting scheduled for ${hours}h ${minutes}m from now. Live button will appear at meeting time.`;
      } else {
        const days = Math.floor(timeDiff / 1440);
        return `✅ Meeting scheduled for ${days} day(s) from now. Live button will appear at meeting time.`;
      }
    }

    // Don't show help text for invalid times - let validation handle it
    return undefined;
  };



  const onFinish = async (values: MomFormValues) => {
    // Generate unique submission ID
    const currentSubmissionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    safeLog.debug('MomCreationForm - Form submission started', {
      title: values.title,
      participantCount: values.participants_ids?.length || 0,
      meetingDateTime: values.meeting_datetime?.format('YYYY-MM-DD HH:mm:ss'),
      submissionId: currentSubmissionId
    });

    if (!canScheduleMom) {
        message.error("You do not have permission to schedule meetings.");
        return;
    }
    
    // Prevent multiple submissions
    if (submitting) {
      safeLog.warn('Form already submitting, ignoring duplicate submission', {
        submissionId: currentSubmissionId
      });
      return;
    }
    
    setSubmitting(true);
    try {
      // Build clean payload — exclude UI-only fields (departments is a local filter, not a backend field)
      const payload = {
        title: values.title,
        agenda: values.agenda,
        location: values.location,
        participants_ids: values.participants_ids,
        // Send as local ISO string so backend timezone comparison is accurate
        meeting_datetime: values.meeting_datetime
          ? values.meeting_datetime.format('YYYY-MM-DDTHH:mm:ss')
          : null,
      };
      console.log('MOM create payload:', payload);
      const response = await api.post('/api/v1/mom/schedule/', payload);
      console.log('MOM CREATED:', response.data);
      safeLog.info('MOM created successfully', {
        momId: response.data.id,
        title: response.data.title,
        participantCount: response.data.participants?.length || 0,
        meetingDateTime: response.data.meeting_datetime
      });
      safeLog.debug('MOM participants comparison', {
        responseParticipants: response.data.participants?.length || 0,
        formParticipants: values.participants_ids.length,
        participantIds: values.participants_ids
      });
      message.success('Meeting scheduled successfully!');

      // Send single batch notification to all participants with deduplication
      try {
        const meetingKey = `${response.data.id}-${values.title}`;
        
        safeLog.info('MoM Creation - Notification process started', {
          meetingId: response.data.id,
          meetingTitle: values.title,
          participantCount: values.participants_ids.length,
          meetingKey,
          alreadySent: notificationsSent.has(meetingKey)
        });
        
        // Check if notifications already sent for this meeting
        if (notificationsSent.has(meetingKey)) {
          safeLog.warn('Notifications already sent for this meeting, skipping duplicate send', {
            meetingKey,
            sentNotifications: Array.from(notificationsSent)
          });
        } else {
          safeLog.info('Sending notifications to participants', {
            participantIds: values.participants_ids,
            meetingTitle: values.title
          });
          
          const notificationPromises = values.participants_ids.map((participantId, index) => {
            safeLog.debug(`Creating notification promise ${index + 1}/${values.participants_ids.length}`, {
              participantId,
              meetingTitle: values.title
            });
            
            return sendNotification(participantId, {
              title: 'New Meeting Invitation',
              message: `You have been invited to: ${values.title}`,
              type: 'meeting_invitation',
              data: { 
                momId: response.data.id,
                userId: participantId,
                title: values.title,
                meetingDateTime: values.meeting_datetime?.toISOString(),
                requiresResponse: true,
                actions: ['accept', 'reject']
              }
            });
          });
          
          // Wait for all notifications to be sent
          const results = await Promise.allSettled(notificationPromises);
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          const failureCount = results.filter(r => r.status === 'rejected').length;
          
          // Mark notifications as sent
          setNotificationsSent(prev => new Set([...prev, meetingKey]));
          
          safeLog.info(`MoM notifications completed`, {
            total: values.participants_ids.length,
            successful: successCount,
            failed: failureCount,
            meetingKey
          });
          
          if (failureCount > 0) {
            safeLog.warn('Some notifications failed to send', {
              failures: results.filter(r => r.status === 'rejected').map((r, index) => ({
                index,
                participantId: values.participants_ids[index],
                reason: r.reason
              }))
            });
          }
        }
      } catch (error) {
        safeLog.error('Failed to send notifications to participants', {
          error,
          meetingId: response.data.id,
          participantCount: values.participants_ids.length
        });
      }

      form.resetFields();
      setUsers(applyEmployeeFilters(employeesList, departmentFilters, participantsSearch));
      setSelectedDateTime(null);
      setNotificationsSent(new Set());
      if (onFinishSuccess) {
        onFinishSuccess(response.data);
      }
    } catch (error: any) {
      safeLog.error("MoM Creation error", {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        submissionId: currentSubmissionId
      });
      console.error('MOM create failed:', error.response?.status, JSON.stringify(error.response?.data));
      const errors = error.response?.data;
      let errorMsg = 'Failed to schedule meeting.';
      if (errors && typeof errors === 'object') {
        // Surface DRF field-level errors (e.g. participants_ids, meeting_datetime)
        const fieldErrors = Object.entries(errors)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ');
        if (fieldErrors) errorMsg = fieldErrors;
      } else if (typeof errors === 'string') {
        errorMsg = errors;
      }
      message.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle form validation failures
  const onFinishFailed = (errorInfo: any) => {
    safeLog.error('MomCreationForm - Form validation failed', errorInfo);
    message.error('Please fix the form errors before submitting.');
    setSubmitting(false);
  };

  if (!canScheduleMom) {
    return (
        <Card className={`theme-card ${effectiveTheme === 'dark' ? 'dark-theme' : 'light-theme'}`}>
            <Title level={4}>Access Denied</Title>
            <p>You do not have permission to schedule Minutes of Meetings.</p>
        </Card>
    );
  }

  return (
    <Card className={`theme-card ${effectiveTheme === 'dark' ? 'dark-theme' : 'light-theme'}`}>
      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
        Schedule New Meeting (MoM)
      </Title>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        onFinishFailed={onFinishFailed}
        initialValues={{ scheduled_by: schedulerUsername }}
        onValuesChange={(changedValues, allValues) => {
          if (changedValues.meeting_datetime) {
            safeLog.debug('Form field changed', {
              changed: changedValues.meeting_datetime,
              all: allValues.meeting_datetime,
              type: typeof changedValues.meeting_datetime
            });
          }
        }}
      >
      <Form.Item label="Scheduled By">
        <Input value={schedulerUsername || 'N/A'} readOnly />
      </Form.Item>

      <Form.Item
        label="Meeting Start Time"
        name="meeting_datetime"
        rules={[
          { required: true, message: 'Please select the meeting start time' },
          {
            validator: (_, value) => {
              if (!value) {
                return Promise.resolve(); // Let required rule handle empty value
              }


              // Handle both dayjs and moment objects
              let selectedTime;
              if (value && typeof value.format === 'function') {
                if (value._isAMomentObject) {
                  selectedTime = value; // Already moment
                } else {
                  selectedTime = moment(value.toDate()); // Convert dayjs to moment
                }
              } else {
                selectedTime = moment(value); // Try to parse as moment
              }

              const currentTime = moment();


              if (selectedTime.isBefore(currentTime)) {
                return Promise.reject(new Error('Meeting time cannot be in the past. Please select a future date and time.'));
              }

              // Check if at least 1 minute in advance (with some tolerance for seconds)
              const minimumAdvanceTime = moment().add(30, 'seconds'); // More lenient - 30 seconds
              if (selectedTime.isBefore(minimumAdvanceTime)) {
                return Promise.reject(new Error('Meeting must be scheduled at least 30 seconds in advance.'));
              }

              return Promise.resolve();
            }
          }
        ]}
        help={getDateTimeHelpText()}
      >
        <DatePicker
          showTime
          format="YYYY-MM-DD HH:mm"
          placeholder="Select future meeting date and time"
          style={{ width: '100%' }}
          onChange={(value) => {
            // Convert dayjs to moment for consistency
            const momentValue = value ? moment(value.toDate()) : null;
            setSelectedDateTime(momentValue);
          }}
          disabledDate={(current) => {
            // Disable all dates before today
            return current && current < moment().startOf('day');
          }}
          disabledTime={React.useMemo(() => (current) => {
            if (!current) return {};

            const now = moment();
            const today = now.format('YYYY-MM-DD');
            const selectedDay = current.format('YYYY-MM-DD');

            if (selectedDay !== today) return {};

            const currentHour = now.hour();
            const currentMinute = now.minute();
            const disabledHours = Array.from({ length: currentHour }, (_, i) => i);

            return {
              disabledHours: () => disabledHours,
              disabledMinutes: (selectedHour: number) => {
                if (selectedHour === currentHour) {
                  return Array.from({ length: currentMinute + 1 }, (_, i) => i);
                }
                return [];
              }
            };
          }, [])}
          showNow={false}
        />
      </Form.Item>

      <Form.Item
        label="Meeting Title"
        name="title"
        rules={[{ required: true, message: 'Please enter the meeting title' }]}
      >
        <Input placeholder="Enter meeting title" />
      </Form.Item>

        <Form.Item
          label="Agenda"
          name="agenda"
          rules={[{ required: true, message: 'Please enter the meeting agenda' }]}
        >
          <Input.TextArea rows={4} placeholder="Enter meeting agenda" />
        </Form.Item>

        <Form.Item
          label="Location"
          name="location"
          rules={[{ required: true, message: 'Please enter the meeting location' }]}
        >
          <Input placeholder="Enter meeting location" />
        </Form.Item>

        <Form.Item
          label="Select Departments for Participants"
          name="departments"
          help="Optional: filter participants by department"
        >
          <Select
            mode="multiple"
            placeholder="Filter by department (optional)"
            onChange={(values: string[]) => {
              setDepartmentFilters(values);
              setUsers(applyEmployeeFilters(employeesList, values, participantsSearch));
            }}
            allowClear
            maxTagCount="responsive"
          >
            {fixedDepartments.map((dept) => (
              <Option key={dept.id} value={dept.name}>
                {dept.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          label={`Participants ${users.length > 0 ? `(${users.length} available)` : ''}`}
          name="participants_ids"
          rules={[{ required: true, message: 'Please select at least one participant' }]}
        >
          <Select
            mode="multiple"
            showSearch
            placeholder={
              loadingEmployees
                ? 'Loading employees...'
                : 'Search by name or employee code'
            }
            loading={loadingEmployees}
            disabled={loadingEmployees}
            optionFilterProp="label"
            filterOption={false}
            onDropdownVisibleChange={handleParticipantsDropdownVisibleChange}
            onSearch={handleParticipantsSearch}
            maxTagCount="responsive"
            notFoundContent={
              loadingEmployees ? (
                <Spin size="small" />
              ) : employeesList.length === 0 ? (
                <span style={{ padding: '8px 12px', display: 'block', color: '#999' }}>
                  No employees found
                </span>
              ) : (
                <span style={{ padding: '8px 12px', display: 'block', color: '#999' }}>
                  No matching employees
                </span>
              )
            }
          >
            {users.map((u) => (
              <Option key={u.id} value={u.id} label={`${u.name} (${u.employee_code})`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500 }}>
                    {u.name} ({u.employee_code})
                  </span>
                </div>
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* Status bar */}
        {!loadingEmployees && (
          <div style={{ marginBottom: 16, padding: '8px 12px', backgroundColor: 'var(--color-ui-hover)', borderRadius: 6 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {employeesList.length > 0
                ? `✅ ${users.length} participant${users.length !== 1 ? 's' : ''} available`
                : '⚠️ No employees loaded yet. Open Participants to load your active client employees.'}
            </Typography.Text>
          </div>
        )}

        <Form.Item style={{ marginTop: 24 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            style={{ width: '100%' }}
            onClick={() => {
            }}
          >
            Schedule Meeting
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default MomCreationForm;