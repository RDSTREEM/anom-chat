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
	const [users, setUsers] = useState([]);
	const [isSending, setIsSending] = useState(false);
	const [deletingId, setDeletingId] = useState(null);
	const [isTyping, setIsTyping] = useState(false);
	const [othersTyping, setOthersTyping] = useState([]);
	let typingTimeout = null;

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

	// Fetch users in the room
	useEffect(() => {
		if (!roomId) return;

		const fetchUsers = async () => {
			let { data: usersData } = await supabase
				.from('messages')
				.select('username')
				.eq('room_id', roomId);
			const uniqueUsers = Array.from(new Set(usersData.map((u) => u.username)));
			setUsers(uniqueUsers);
		};

		fetchUsers();

		// Listen for new messages to update user list
		const subscription = supabase
			.channel(`room-${roomId}-userlist`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'messages',
					filter: `room_id=eq.${roomId}`
				},
				() => fetchUsers()
			)
			.subscribe();

		return () => {
			supabase.removeChannel(subscription);
		};
	}, [roomId]);

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

	// Listen for typing events
	useEffect(() => {
		if (!roomId) return;

		const channel = supabase.channel(`typing-${roomId}`);
		channel
			.on('broadcast', { event: 'typing' }, (payload) => {
				if (payload.payload.username !== username) {
					setOthersTyping((prev) => {
						if (!prev.includes(payload.payload.username)) {
							return [...prev, payload.payload.username];
						}
						return prev;
					});
					setTimeout(() => {
						setOthersTyping((prev) =>
							prev.filter((u) => u !== payload.payload.username)
						);
					}, 2000);
				}
			})
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [roomId, username]);

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

	// Broadcast typing event
	const handleTyping = (e) => {
		setMessage(e.target.value);
		if (!isTyping) {
			setIsTyping(true);
			supabase.channel(`typing-${roomId}`).send({
				type: 'broadcast',
				event: 'typing',
				payload: { username }
			});
			if (typingTimeout) clearTimeout(typingTimeout);
			typingTimeout = setTimeout(() => setIsTyping(false), 2000);
		}
	};

	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-6">
			<h2 className="text-xl font-bold mb-2">Room: {room}</h2>
			{users.length > 0 && (
				<div className="mb-2 w-full max-w-lg text-xs text-gray-600 flex flex-wrap gap-2">
					<strong>Users:</strong> {users.join(', ')}
				</div>
			)}
			<div className="h-64 overflow-y-auto border p-2 mb-2 w-full max-w-lg">
				{messages.map((msg, index) => (
					<div key={index} className="flex items-center text-sm group">
						<p className="flex-1">
							<strong>{msg.username}:</strong> {msg.message}
							<span className="text-xs text-gray-400 ml-2">
								{msg.created_at
									? new Date(msg.created_at).toLocaleTimeString([], {
											hour: '2-digit',
											minute: '2-digit'
										})
									: ''}
							</span>
						</p>
						{msg.username === username && (
							<button
								disabled={deletingId === msg.id}
								onClick={async () => {
									setDeletingId(msg.id);
									await supabase.from('messages').delete().eq('id', msg.id);
									setMessages((prev) => prev.filter((m) => m.id !== msg.id));
									setDeletingId(null);
								}}
								className="ml-2 text-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
								{deletingId === msg.id ? 'Deleting...' : 'Delete'}
							</button>
						)}
					</div>
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
				onChange={handleTyping}
				onKeyDown={handleKeyPress} // Enter key sends message
			/>
			{othersTyping.length > 0 && (
				<div className="text-xs text-gray-500 mb-2 w-full max-w-lg">
					{othersTyping.join(', ')} {othersTyping.length === 1 ? 'is' : 'are'}{' '}
					typing...
				</div>
			)}
			<button
				onClick={sendMessage}
				disabled={isSending}
				className="bg-green-500 text-white px-4 py-2 rounded w-full mt-2">
				{isSending ? 'Sending...' : 'Send'}
			</button>
		</div>
	);
}
