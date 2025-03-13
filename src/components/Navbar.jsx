import React from 'react';
import Button from './Button';
import Link from 'next/link';

function Navbar() {
	return (
		<nav>
			<ul className="flex w-full flex-row justify-between px-8 py-4 border-b-1 b-white">
				<li>AnomChat</li>
				<li>
					<Link href="/chat">
						<Button>Start Chatting</Button>
					</Link>
				</li>
			</ul>
		</nav>
	);
}

export default Navbar;
