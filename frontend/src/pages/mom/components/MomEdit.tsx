import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Select, Typography, Card, Spin, App } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../../lib/api';
import { useAuthStore } from '../../../store/authStore';
//import { sendNotification, type NotificationType } from '../../../common/utils/notificationService';
import { DatePicker } from 'antd';
import moment from 'moment';
import type { Moment } from 'moment';
// import { useTheme } from '../../../contexts/ThemeContext'; // DISABLED
import PageLayout from '../../../components/ui/PageLayout';

const { Title } = Typography;
const { Option } = Select;

interface User {
  id: number;
  username: string;
  name?: string; // Full name
  email: string;
  department?: { id: number; name: string; } | string | number; // Can be object, string, or ID
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
  participants_ids: number[]; // Array of user IDs
  department?: string; // Changed to string to match fixed options
  meeting_datetime: Moment | null; // Moment object for meeting start time
}

const fixedDepartments = [
  { id: 1, name: 'Quality' },
  { id: 2, name: 'Safety' },
  { id: 3, name: 'Inventory' },
  { id: 4, name: 'Project/Execution' },
];

const MomEdit: React.FC = () => {
  const [form] = Form.useForm();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const schedulerUsername = user?.username || user?.email || '';
  const schedulerUserId = user?.id;
  const schedulerUserType = user?.user_type;
  const schedulerAdminType = user?.admin_type;
  const canEditMom = Boolean(
    user && (
      schedulerUserType === 'adminuser' ||
      (schedulerUserType === 'companyuser' && ['client', 'epc', 'clientuser', 'epcuser'].includes(schedulerAdminType || '')) ||
      ['client', 'epc', 'clientuser', 'epcuser'].includes(schedulerAdminType || '')
    )
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [users, setUsers] = useState<Employee[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [participantsSearch, setParticipantsSearch] = useState('');
  const [selectedDateTime, setSelectedDateTime] = useState<moment.Moment | null>(null);
  const effectiveTheme = 'light'; // Default theme

  const { message } = App.useApp();
  const messageRef = useRef(message);
  useEffect(() => { messageRef.current = message; }, [message]);

  useEffect(() => {
    if (!canEditMom) {
      messageRef.current.error('You do not have permission to edit this meeting.');
    }
  }, [canEditMom]);

  useEffect(() => {
    const fetchMom = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const response = await apiClient.get(`/api/v1/mom/${id}/`);
        const momData = response.data;

        if (!momData.can_edit) {
          messageRef.current.error('You do not have permission to edit this meeting.');
          navigate('/app/mom');
          return;
        }

        const meetingDateTime = momData.meeting_datetime ? moment(momData.meeting_datetime) : null;
        form.setFieldsValue({
          title: momData.title,
          agenda: momData.agenda,
          meeting_datetime: meetingDateTime,
          participants_ids: momData.participants_ids || [],
        });
        setSelectedDateTime(meetingDateTime);

        // Resolve participants — prefer embedded details, fall back to parallel batch fetch
        let participants: User[] = [];
        if (momData.participants && momData.participants.length > 0) {
          participants = momData.participants;
        } else if (momData.participants_ids && momData.participants_ids.length > 0) {
          // Parallel fetch — all requests fire at once instead of sequentially
          const results = await Promise.allSettled(
            momData.participants_ids.map((uid: number) => apiClient.get(`/api/v1/users/${uid}/`))
          );
          participants = results
            .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
            .map(r => r.value.data);
        }

          if (participants.length > 0) {
          const depts = participants
            .map((p: any) => p.department?.name || p.department)
            .filter((d: string, i: number, arr: string[]) => d && arr.indexOf(d) === i);
          if (depts.length > 0) {
            setSelectedDepartments(depts);
            form.setFieldsValue({ departments: depts });
          }
        }
      } catch {
        messageRef.current.error('Failed to load meeting data.');
      } finally {
        setLoading(false);
      }
    };
    fetchMom();
  }, [id]); // ← only re-run when id changes, not on every render

  const applyEmployeeFilters = (
    list: Employee[],
    departments: string[] = selectedDepartments,
    search = participantsSearch
  ) => {
    const searchText = search?.trim().toLowerCase() ?? '';
    const departmentFilters = departments.map((dept) => dept.toLowerCase());

    return list.filter((employee) => {
      const matchesDepartment =
        departmentFilters.length === 0 ||
        departmentFilters.some((filter) =>
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
      const response = await apiClient.get('/employees', {
        params: {
          company_type: 'client',
          status: 'active',
        },
      });
      const raw = Array.isArray(response.data) ? response.data : response.data?.results ?? [];
      const mapped: Employee[] = raw.map((e: any) => ({
        id: e.id,
        name: (e.name || e.full_name || '').trim(),
        employee_code: String(e.employee_code || e.id).padStart(2, '0'),
        department:
          typeof e.department === 'object'
            ? e.department?.name
            : e.department || '',
      }));
      setEmployeesList(mapped);
      setUsers(applyEmployeeFilters(mapped, selectedDepartments, participantsSearch));
      setEmployeesLoaded(true);
    } catch {
      messageRef.current.error('Failed to load participant employees.');
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
    setUsers(applyEmployeeFilters(employeesList, selectedDepartments, value));
  };

  const handleDepartmentChange = (values: string[]) => {
    setSelectedDepartments(values);
    setUsers(applyEmployeeFilters(employeesList, values, participantsSearch));

    // Clear current participants when departments change manually
    form.setFieldsValue({ participants_ids: [] });
  };

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

  // Handle date/time change
  const handleDateTimeChange = (value: moment.Moment | null) => {
    setSelectedDateTime(value);
    form.setFieldsValue({ meeting_datetime: value });
  };

  const onFinish = async (values: MomFormValues) => {
    if (!canEditMom) {
      messageRef.current.error('You do not have permission to edit meetings.');
      return;
    }
    if (!id) {
      message.error("Invalid meeting ID.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        meeting_datetime: values.meeting_datetime ? values.meeting_datetime.toISOString() : null,
        scheduled_by: schedulerUserId,
      };
      await apiClient.put(`/api/v1/mom/${id}/`, payload);
      messageRef.current.success('Meeting updated successfully!');
      navigate('/app/mom');
    } catch (error: any) {
      const errors = error?.response?.data;
      let errorMsg = 'Failed to update meeting.';
      if (errors && typeof errors === 'object') {
        errorMsg += ' ' + Object.entries(errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' ');
      } else if (typeof errors === 'string') {
        errorMsg = errors;
      }
      messageRef.current.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageLayout
        title="Edit Meeting"
        subtitle="Modify meeting details"
        breadcrumbs={[
          { title: 'MOM', href: '/app/mom' },
          { title: 'Edit Meeting' }
        ]}
      >
        <div className="flex justify-center items-center min-h-64">
          <Spin description="Loading meeting data..." size="large" />
        </div>
      </PageLayout>
    );
  }

  if (!canEditMom) {
    return (
      <PageLayout
        title="Edit Meeting"
        subtitle="Access denied"
        breadcrumbs={[
          { title: 'MOM', href: '/app/mom' },
          { title: 'Edit Meeting' }
        ]}
      >
        <Card className={`theme-card ${effectiveTheme === 'dark' ? 'dark-theme' : 'light-theme'}`}>
          <Title level={4}>Access Denied</Title>
          <p>You do not have permission to edit Minutes of Meetings.</p>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Edit Meeting"
      subtitle="Modify meeting details and participants"
      breadcrumbs={[
        { title: 'MOM', href: '/app/mom' },
        { title: 'Edit Meeting' }
      ]}
    >
      <Card
        className={`theme-card ${effectiveTheme === 'dark' ? 'dark-theme' : 'light-theme'}`}
        variant="borderless"
      >
      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
        Edit Meeting (MoM)
      </Title>
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ scheduled_by: schedulerUsername }}>
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

                const selectedTime = moment(value);
                const currentTime = moment();

                if (selectedTime.isBefore(currentTime)) {
                  return Promise.reject(new Error('Meeting time cannot be in the past. Please select a future date and time.'));
                }

                // Optional: Add minimum advance notice (e.g., at least 1 minute from now)
                const minimumAdvanceTime = moment().add(1, 'minute');
                if (selectedTime.isBefore(minimumAdvanceTime)) {
                  return Promise.reject(new Error('Meeting must be scheduled at least 1 minute in advance.'));
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
            onChange={handleDateTimeChange}
            disabledDate={(current) => {
              // Disable all dates before today
              return current && current < moment().startOf('day');
            }}
            disabledTime={(current) => {
              // If the selected date is today, disable past hours and minutes
              if (!current) {
                return {}; // No restrictions if no date selected
              }

              const now = moment();
              const today = now.format('YYYY-MM-DD');
              const selectedDay = current.format('YYYY-MM-DD');

              // Only apply time restrictions if the selected date is today
              if (selectedDay !== today) {
                return {}; // No time restrictions for future dates
              }

              const currentHour = now.hour();
              const currentMinute = now.minute();

              return {
                disabledHours: () => {
                  const hours = [];
                  for (let i = 0; i < currentHour; i++) {
                    hours.push(i);
                  }
                  return hours;
                },
                disabledMinutes: (selectedHour: number) => {
                  if (selectedHour === currentHour) {
                    const minutes = [];
                    for (let i = 0; i <= currentMinute; i++) { // Only disable current and past minutes
                      minutes.push(i);
                    }
                    return minutes;
                  }
                  return [];
                }
              };
            }}
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
          label="Select Departments for Participants"
          name="departments"
          help="Select one or more departments to filter the employee list"
        >
          <Select
            mode="multiple"
            placeholder="Select departments (optional)"
            onChange={handleDepartmentChange}
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
          label="Participants"
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
            filterOption={false}
            onDropdownVisibleChange={handleParticipantsDropdownVisibleChange}
            onSearch={handleParticipantsSearch}
            optionLabelProp="label"
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
            {users.map((user) => (
              <Option
                key={user.id}
                value={user.id}
                label={`${user.name} (${user.employee_code})`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500 }}>
                    {user.name} ({user.employee_code})
                  </span>
                </div>
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* Show department selection status */}
        {selectedDepartments.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--color-ui-hover)', borderRadius: 6 }}>
            <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
              <strong>Selected Departments:</strong> {selectedDepartments.join(', ')}
              <br />
              <strong>Available Participants:</strong> {users.length} users loaded
              {loadingEmployees && ' (Loading...)'}
            </Typography.Text>
          </div>
        )}

        {loadingEmployees && <Spin description="Loading employees..." />}

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" loading={submitting} style={{ width: '100%' }}>
            Update Meeting
          </Button>
        </Form.Item>
      </Form>
      </Card>
    </PageLayout>
  );
};

export default MomEdit;
