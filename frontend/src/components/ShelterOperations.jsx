import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ShelterOperations({ onBack }) {

    // adding shelter states

    const [shelters, setShelters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [citizenId, setCitizenId] = useState('');
    const [selectedShelterId, setSelectedShelterId] = useState('');
    const [checkinLoading, setCheckinLoading] = useState(false);
    const [checkoutCitizenId, setCheckoutCitizenId] = useState('');
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [activeCheckins, setActiveCheckins] = useState([]);

    // fetching shelters + occupancy
    useEffect(() => {
        const loadShelters = async () => {
            try {
                setLoading(true);

                const { data: shelterData, error: shelterError } =
                    await supabase
                        .from('shelters')
                        .select('*')
                        .order('name');

                if (shelterError) {
                    throw shelterError;
                }

                const { data: occupancyData, error: occupancyError } =
                    await supabase
                        .from('shelter_occupancy')
                        .select('*');

                if (occupancyError) {
                    throw occupancyError;
                }

                const combined = (shelterData || []).map((shelter) => {
                    const occupancy = (occupancyData || []).find(
                        (item) => item.shelter_id === shelter.id
                    );

                    return {
                        ...shelter,
                        current_occupancy: Number(
                            occupancy?.current_occupancy || 0
                        ),
                    };
                });

                setShelters(combined);
            } catch (err) {
                console.error('Failed to load shelters:', err);
                setError('Failed to load shelter information.');
            } finally {
                setLoading(false);
            }
        };

        loadShelters();
    }, []);

    //FETCH ACTIVE CHECK-INS
    useEffect(() => {
        const loadActiveCheckins = async () => {
            try {
                const { data, error } = await supabase
                    .from('shelter_checkins')
                    .select(`
          id,
          citizen_id,
          shelter_id,
          check_in_time,
          citizens (
            name,
            phone
          ),
          shelters (
            name
          )
        `)
                    .is('check_out_time', null)
                    .order('check_in_time', { ascending: false });

                if (error) {
                    throw error;
                }

                setActiveCheckins(data || []);
            } catch (err) {
                console.error('Failed to load active check-ins:', err);
            }
        };

        loadActiveCheckins();
    }, []);

    // ADD CHECKIN FUNCTION

    const handleCheckIn = async () => {
        if (!citizenId || !selectedShelterId) {
            alert('Please enter a citizen ID and select a shelter.');
            return;
        }

        try {
            setCheckinLoading(true);

            // Check whether this citizen is already checked in
            const { data: existingCheckin, error: existingError } =
                await supabase
                    .from('shelter_checkins')
                    .select(`
          id,
          shelter_id,
          shelters (
            name
          )
        `)
                    .eq('citizen_id', citizenId)
                    .is('check_out_time', null)
                    .maybeSingle();

            if (existingError) {
                throw existingError;
            }

            // Prevent duplicate active check-in
            if (existingCheckin) {
                alert(
                    `Citizen is already checked in at ${existingCheckin.shelters?.name || 'another shelter'}.`
                );
                return;
            }

            // Create new check-in
            const { error } = await supabase
                .from('shelter_checkins')
                .insert({
                    citizen_id: citizenId,
                    shelter_id: selectedShelterId,
                });

            if (error) {
                throw error;
            }

            alert('Citizen checked in successfully.');

            // Update occupancy immediately
            setShelters((prev) =>
                prev.map((shelter) =>
                    shelter.id === selectedShelterId
                        ? {
                            ...shelter,
                            current_occupancy:
                                Number(shelter.current_occupancy || 0) + 1,
                        }
                        : shelter
                )
            );

            const { data: newCheckin } = await supabase
                .from('shelter_checkins')
                .select(`
    id,
    citizen_id,
    shelter_id,
    check_in_time,
    citizens (
      name,
      phone
    ),
    shelters (
      name
    )
  `)
                .eq('citizen_id', citizenId)
                .eq('shelter_id', selectedShelterId)
                .is('check_out_time', null)
                .order('check_in_time', { ascending: false })
                .limit(1)
                .single();

            if (newCheckin) {
                setActiveCheckins((prev) => [
                    newCheckin,
                    ...prev,
                ]);
            }
            setCitizenId('');
            setSelectedShelterId('');

        } catch (err) {
            console.error('Check-in failed:', err);
            alert('Failed to check in citizen.');
        } finally {
            setCheckinLoading(false);
        }
    };



    // HANDLE CHECKOUTS

    const handleCheckOut = async () => {
        if (!checkoutCitizenId) {
            alert('Please enter a citizen ID.');
            return;
        }

        try {
            setCheckoutLoading(true);

            const { data, error } = await supabase
                .from('shelter_checkins')
                .select('id, shelter_id')
                .eq('citizen_id', checkoutCitizenId)
                .is('check_out_time', null)
                .limit(1)
                .single();

            if (error) {
                throw error;
            }

            const { error: updateError } = await supabase
                .from('shelter_checkins')
                .update({
                    check_out_time: new Date().toISOString(),
                })
                .eq('id', data.id);

            if (updateError) {
                throw updateError;
            }

            setShelters((prev) =>
                prev.map((shelter) =>
                    shelter.id === data.shelter_id
                        ? {
                            ...shelter,
                            current_occupancy: Math.max(
                                0,
                                Number(shelter.current_occupancy || 0) - 1
                            ),
                        }
                        : shelter
                )
            );

            setCheckoutCitizenId('');

            alert('Citizen checked out successfully.');

        } catch (err) {
            console.error('Check-out failed:', err);
            alert('No active shelter check-in found for this citizen.');
        } finally {
            setCheckoutLoading(false);
        }
    };

    return (
        <div
            style={{
                gridColumn: '1 / -1',
                width: '100%',
                minHeight: '100%',
                boxSizing: 'border-box',
                padding: '24px',
                background: '#080f19',
                font: 'inherit',
                color: '#e6edf5',
            }}
        >
            {/* HEADER */}
            <div
                style={{
                    marginBottom: '24px',
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: '18px',
                }}
            >
                <button
                    type="button"
                    onClick={onBack}
                    style={{
                        marginBottom: '18px',
                        padding: '9px 14px',
                        background: '#e2e8f0',
                        color: '#0f172a',
                        border: 'none',
                        borderRadius: '7px',
                        cursor: 'pointer',
                        fontWeight: '600',
                    }}
                >
                    ← BACK TO FLOOD COMMAND
                </button>

                <h1
                    style={{
                        margin: 0,
                        fontSize: '28px',
                        fontWeight: '700',
                        color: '#f8fafc',
                    }}
                >
                    Shelter Operations
                </h1>

                <p
                    style={{
                        marginTop: '6px',
                        marginBottom: 0,
                        color: '#64748b',
                        fontSize: '14px',
                    }}
                >
                    Manage rescued citizens and emergency shelter capacity
                </p>
            </div>

            {/* MAIN CARD */}
            <div
                style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
                }}
            >
                <h2
                    style={{
                        marginTop: 0,
                        marginBottom: '18px',
                        color: '#0f172a',
                        fontSize: '20px',
                    }}
                >
                    🏠 Shelter Operations
                </h2>

                {/* LOADING */}
                {loading && (
                    <p style={{ color: '#64748b' }}>
                        Loading shelters...
                    </p>
                )}

                {/* ERROR */}
                {error && (
                    <p
                        style={{
                            color: '#dc2626',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            padding: '10px 12px',
                            borderRadius: '7px',
                        }}
                    >
                        {error}
                    </p>
                )}

                {/* NO SHELTERS */}
                {!loading && !error && shelters.length === 0 && (
                    <p style={{ color: '#64748b' }}>
                        No shelters found.
                    </p>
                )}

                {/* SHELTERS */}
                {!loading && !error && shelters.length > 0 && (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns:
                                'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: '12px',
                        }}
                    >
                        {shelters.map((shelter) => (
                            <div
                                key={shelter.id}
                                style={{
                                    padding: '15px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '9px',
                                    background: '#f8fafc',
                                }}
                            >
                                <strong
                                    style={{
                                        display: 'block',
                                        marginBottom: '8px',
                                        color: '#0f172a',
                                        fontSize: '15px',
                                    }}
                                >
                                    {shelter.name}
                                </strong>

                                <div
                                    style={{
                                        fontSize: '13px',
                                        color: '#64748b',
                                        marginBottom: '5px',
                                    }}
                                >
                                    Status:{' '}
                                    <span
                                        style={{
                                            color: '#16a34a',
                                            fontWeight: '600',
                                        }}
                                    >
                                        {shelter.status || 'open'}
                                    </span>
                                </div>

                                <div
                                    style={{
                                        fontSize: '13px',
                                        color: '#475569',
                                        marginBottom: '5px',
                                    }}
                                >
                                    Occupancy:{' '}
                                    <strong style={{ color: '#0f172a' }}>
                                        {shelter.current_occupancy}
                                    </strong>{' '}
                                    / {shelter.capacity || 0}
                                </div>

                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: '#64748b',
                                    }}
                                >
                                    Location: {shelter.lat}, {shelter.lng}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* CHECK-IN */}
                <div
                    style={{
                        marginTop: '24px',
                        padding: '16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '9px',
                        background: '#ffffff',
                    }}
                >
                    <h3
                        style={{
                            marginTop: 0,
                            color: '#0f172a',
                            fontSize: '16px',
                        }}
                    >
                        Citizen Check-In
                    </h3>

                    <div
                        style={{
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap',
                        }}
                    >
                        <input
                            type="text"
                            placeholder="Enter Citizen ID"
                            value={citizenId}
                            onChange={(e) => setCitizenId(e.target.value)}
                            style={{
                                padding: '9px 10px',
                                width: '260px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                outline: 'none',
                                color: '#0f172a',
                            }}
                        />

                        <select
                            value={selectedShelterId}
                            onChange={(e) =>
                                setSelectedShelterId(e.target.value)
                            }
                            style={{
                                padding: '9px 10px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                background: '#ffffff',
                                color: '#0f172a',
                            }}
                        >
                            <option value="">Select Shelter</option>

                            {shelters.map((shelter) => (
                                <option key={shelter.id} value={shelter.id}>
                                    {shelter.name}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            onClick={handleCheckIn}
                            disabled={checkinLoading}
                            style={{
                                padding: '9px 14px',
                                background: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '7px',
                                cursor: checkinLoading
                                    ? 'not-allowed'
                                    : 'pointer',
                                fontWeight: '600',
                            }}
                        >
                            {checkinLoading
                                ? 'Checking In...'
                                : 'Check In Citizen'}
                        </button>
                    </div>
                </div>

                {/* CHECK-OUT */}
                <div
                    style={{
                        marginTop: '16px',
                        padding: '16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '9px',
                        background: '#ffffff',
                    }}
                >
                    <h3
                        style={{
                            marginTop: 0,
                            color: '#0f172a',
                            fontSize: '16px',
                        }}
                    >
                        Citizen Check-Out
                    </h3>

                    <div
                        style={{
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap',
                        }}
                    >
                        <input
                            type="text"
                            placeholder="Enter Citizen ID"
                            value={checkoutCitizenId}
                            onChange={(e) =>
                                setCheckoutCitizenId(e.target.value)
                            }
                            style={{
                                padding: '9px 10px',
                                width: '260px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                outline: 'none',
                                color: '#0f172a',
                            }}
                        />

                        <button
                            type="button"
                            onClick={handleCheckOut}
                            disabled={checkoutLoading}
                            style={{
                                padding: '9px 14px',
                                background: '#0f172a',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '7px',
                                cursor: checkoutLoading
                                    ? 'not-allowed'
                                    : 'pointer',
                                fontWeight: '600',
                            }}
                        >
                            {checkoutLoading
                                ? 'Checking Out...'
                                : 'Check Out Citizen'}
                        </button>
                    </div>
                </div>

                {/* ACTIVE CITIZENS */}
                <div
                    style={{
                        marginTop: '24px',
                        padding: '16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '9px',
                        background: '#ffffff',
                    }}
                >
                    <h3
                        style={{
                            marginTop: 0,
                            color: '#0f172a',
                            fontSize: '16px',
                        }}
                    >
                        Currently Sheltered Citizens
                    </h3>

                    {activeCheckins.length === 0 ? (
                        <p style={{ color: '#64748b' }}>
                            No citizens are currently checked in.
                        </p>
                    ) : (
                        <div>
                            {activeCheckins.map((checkin) => (
                                <div
                                    key={checkin.id}
                                    style={{
                                        padding: '12px 4px',
                                        borderBottom: '1px solid #e2e8f0',
                                    }}
                                >
                                    <strong
                                        style={{
                                            color: '#0f172a',
                                            fontSize: '14px',
                                        }}
                                    >
                                        {checkin.citizens?.name ||
                                            'Unknown Citizen'}
                                    </strong>

                                    <div
                                        style={{
                                            marginTop: '4px',
                                            fontSize: '13px',
                                            color: '#475569',
                                        }}
                                    >
                                        Shelter:{' '}
                                        {checkin.shelters?.name ||
                                            'Unknown Shelter'}
                                    </div>

                                    <div
                                        style={{
                                            marginTop: '3px',
                                            fontSize: '13px',
                                            color: '#64748b',
                                        }}
                                    >
                                        Check-in:{' '}
                                        {checkin.check_in_time
                                            ? new Date(
                                                checkin.check_in_time
                                            ).toLocaleString()
                                            : 'Unknown'}
                                    </div>

                                    {checkin.citizens?.phone && (
                                        <div
                                            style={{
                                                marginTop: '3px',
                                                fontSize: '13px',
                                                color: '#64748b',
                                            }}
                                        >
                                            Phone: {checkin.citizens.phone}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}