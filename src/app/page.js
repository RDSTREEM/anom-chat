'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

export default function ChatRoom({ params }) {
	const router = useRouter();
	const room = params.room;
	const [roomId, setRoomId] = useState(null);
	const [username, setUsername] = useState('');
	const [message, setMessage] = useState('');
	const [messages, setMessages] = useState([]);
	const [isSending, setIsSending] = useState(false);

	// Load saved username from localStorage
	useEffect(() => {
		let savedUsername = localStorage.getItem('username');

		if (!savedUsername) {
			savedUsername = `user-${Math.floor(Math.random() * 100000)}`;
			localStorage.setItem('username', savedUsername);
		}

		setUsername(savedUsername);
	}, []);

	// Fetch room details and messages
	useEffect(() => {
		if (!room) return;

		const fetchRoom = async () => {
			let { data: roomData } = await supabase
				.from('rooms')
				.select('*')
				.eq('name', room)
				.single();

			if (!roomData) {
				router.push('/'); // Redirect if room doesn’t exist
				return;
			}

			setRoomId(roomData.id);

			let { data: messagesData } = await supabase
				.from('messages')
				.select('*')
				.eq('room_id', roomData.id)
				.order('created_at', { ascending: true });

			setMessages(messagesData);
		};

		fetchRoom();
	}, [room, router]);

	// Listen for new messages in the room
	useEffect(() => {
		if (!roomId) return;

		const subscription = supabase
			.channel(`room-${roomId}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'messages',
					filter: `room_id=eq.${roomId}`
				},
				(payload) => {
					setMessages((prev) => [...prev, payload.new]);
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(subscription);
		};
	}, [roomId]);

	// Send a message
	const sendMessage = async () => {
		if (!message.trim() || !roomId || isSending) return;

		setIsSending(true);
		await supabase
			.from('messages')
			.insert([{ username, message, room_id: roomId }]);
		setMessage('');
		setIsSending(false);
	};

	// Send message when Enter is pressed
	const handleKeyPress = (e) => {
		if (e.key === 'Enter') sendMessage();
	};

	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-6">
			<h2 className="text-xl font-bold mb-2">Room: {room}</h2>
			<div className="h-64 overflow-y-auto border p-2 mb-2 w-full max-w-lg">
				{messages.map((msg, index) => (
					<p key={index} className="text-sm">
						<strong>{msg.username}:</strong> {msg.message}
					</p>
				))}
			</div>
			<input
				type="text"
				placeholder="Username"
				className="border p-2 rounded w-full mb-2"
				value={username}
				readOnly
			/>
			<input
				type="text"
				placeholder="Type a message..."
				className="border p-2 rounded w-full"
				value={message}
				onChange={(e) => setMessage(e.target.value)}
				onKeyDown={handleKeyPress} // Enter key sends message
			/>
			<button
				onClick={sendMessage}
				disabled={isSending}
				className="bg-green-500 text-white px-4 py-2 rounded w-full mt-2">
				{isSending ? 'Sending...' : 'Send'}
			</button>
		</div>
	);
}
