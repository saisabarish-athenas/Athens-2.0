import React, { useState, useEffect } from 'react';
import { Button, Space, Tag, Input, DatePicker, Select, App, Popconfirm, Typography, Row, Col, Table } from 'antd';
import { PlusOutlined, SearchOutlined, FilterOutlined, DeleteOutlined, EditOutlined, DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import { getPermitsPaginated, deletePermit, exportPermitsExcel, bulkExportPDF, bulkExportExcel } from '../api';
import * as Types from '../types';
import { useAuthStore } from '../../../store/authStore';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface PermitListProps {
  onViewPermit?: (permit: Types.Permit) => void;
  onEditPermit?: (permit: Types.Permit) => void;
  refreshKey?: number;
}

const PermitList: React.FC<PermitListProps> = ({ onViewPermit, onEditPermit, refreshKey }) => {
  const {message} = App.useApp();
  const [permits, setPermits] = useState<Types.Permit[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  
  // Filters
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const usertype = useAuthStore((state) => state.usertype);
  const django_user_type = useAuthStore((state) => state.django_user_type);
  const grade = useAuthStore((state) => state.grade);
  const currentUserId = useAuthStore((state) => state.userId);



  const canCreatePermit = (): boolean => {
    if (!usertype || !django_user_type || !grade) return false;
    if (django_user_type === 'adminuser' && usertype === 'contractoruser') return true;
    if (django_user_type === 'adminuser' && (usertype === 'epcuser' || usertype === 'clientuser') && grade === 'C') return true;
    if (django_user_type === 'projectadmin') return true;
    return false;
  };

  const canDeletePermit = (permit: Types.Permit): boolean => {
    return permit.created_by === currentUserId;
  };

  const handleDeletePermit = async (permitId: number, permitNumber: string) => {    try {
      await deletePermit(permitId);
      message.success(`Permit ${permitNumber} deleted successfully`);
      fetchPermits();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Failed to delete permit');
    }
  };

  const handlePaginationChange = (page: number, size: number) => {
    setCurrentPage(page);
    setPageSize(size);
  };

  const fetchPermits = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: currentPage,
        page_size: pageSize,
      };

      if (searchText) params.search = searchText;
      if (statusFilter) params.status = statusFilter;
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await getPermitsPaginated(params);
      
      // API returns paginated response with results array
      const results = response.data.results || response.data || [];
      const count = response.data.count || (Array.isArray(response.data) ? response.data.length : 0);
      
      setPermits(results);
      setTotalCount(count);
    } catch (error) {
      message.error('Failed to load permits');
      setPermits([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset to page 1 when filters change; fetchPermits fires via the page/pageSize effect
    if (currentPage !== 1) {
      setCurrentPage(1);
    } else {
      fetchPermits();
    }
  }, [searchText, statusFilter, dateRange, refreshKey]);

  useEffect(() => {
    fetchPermits();
  }, [currentPage, pageSize]);

  const handleExportFiltered = async () => {
    try {
      const params: any = {};
      if (searchText) params.search = searchText;
      if (statusFilter) params.status = statusFilter;
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await exportPermitsExcel(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `permits_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success('Export completed');
    } catch (error: any) {
      message.error('Export failed');
    }
  };

  const handleBulkExport = async (format: 'pdf' | 'excel') => {
    if (selectedRowKeys.length === 0) {
      message.warning('Please select permits to export');
      return;
    }

    try {
      const permitIds = selectedRowKeys.map(k => Number(k));
      const response = format === 'pdf' 
        ? await bulkExportPDF({ permit_ids: permitIds })
        : await bulkExportExcel({ permit_ids: permitIds });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const ext = format === 'pdf' ? 'zip' : 'xlsx';
      link.setAttribute('download', `permits_bulk_${dayjs().format('YYYYMMDD_HHmmss')}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success(`Bulk export (${format}) completed`);
    } catch (error: any) {
      message.error(`Bulk export failed`);
    }
  };

  const statusOptions = [
    { value: 'draft', label: 'Draft' },
    { value: 'pending_verification', label: 'Pending Verification' },
    { value: 'verified', label: 'Verified' },
    { value: 'pending_approval', label: 'Pending Approval' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'closed', label: 'Closed' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
  
  const columns = [
    {
      title: 'Permit Number',
      dataIndex: 'permit_number',
      key: 'permit_number',
      render: (text: string) => (
        <span style={{ fontWeight: 'bold', color: '#1890ff' }}>{text}</span>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'permit_type_details',
      key: 'permit_type',
      render: (type: any) => (
        type ? <Tag color={type?.color_code || 'blue'}>{type?.name || 'N/A'}</Tag> : <Tag>N/A</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: Types.PermitStatus) => {
        const statusColors: Record<string, string> = {
          draft: 'default',
          submitted: 'processing',
          under_review: 'warning',
          approved: 'success',
          active: 'success',
          suspended: 'warning',
          completed: 'purple',
          cancelled: 'default',
          expired: 'error',
          rejected: 'error'
        };
        return <Tag color={statusColors[status] || 'default'}>{status.replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Verifier',
      key: 'verifier',
      render: (_: any, record: Types.Permit) => 
        record.verifier_details ? 
          (record.verifier_details.full_name || `${record.verifier_details.name || ''} ${record.verifier_details.surname || ''}`.trim() || record.verifier_details.username || '—') :
          '—',
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
    },
    {
      title: 'Planned Start',
      dataIndex: 'planned_start_time',
      key: 'planned_start_time',
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '—',
    },
    {
      title: 'Planned End',
      dataIndex: 'planned_end_time',
      key: 'planned_end_time',
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Types.Permit) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => onViewPermit?.(record)}
          >
            View
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEditPermit?.(record)}
          >
            Edit
          </Button>
          {canDeletePermit(record) && (
            <Popconfirm
              title="Delete Permit"
              description={`Are you sure you want to delete permit ${record.permit_number}?`}
              onConfirm={() => handleDeletePermit(record.id, record.permit_number)}
              okText="Yes, Delete"
              cancelText="Cancel"
              okType="danger"
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  return (
    <div>
      <div style={{ marginBottom: 16, padding: '16px', backgroundColor: '#fff', borderRadius: '8px' }}>
        <Row gutter={16}>
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder="Search permits"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              prefix={<SearchOutlined />}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={8} md={4}>
            <Select
              placeholder="Filter by status"
              allowClear
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
            >
              {statusOptions.map(option => (
                <Option key={option.value} value={option.value}>{option.label}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={16} md={6}>
            <RangePicker 
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px' }}>
        <Table
          columns={columns}
          dataSource={permits}
          rowKey="id"
          loading={loading}
          rowSelection={rowSelection}
          scroll={{ x: 'max-content', y: 'calc(100vh - 300px)' }}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: totalCount,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} permits`,
            onChange: handlePaginationChange,
            onShowSizeChange: handlePaginationChange,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          size="middle"
        />
      </div>
    </div>
  );
};

export default PermitList;
