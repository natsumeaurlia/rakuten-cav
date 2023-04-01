import axios from "axios";

export const lineNotify = async (message: string, token: string) => {
    const endpoint = 'https://notify-api.line.me/api/notify';
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${token}`,
    };
    const data = new URLSearchParams({ message }).toString();

    try {
        const response = await axios.post(endpoint, data, { headers });

        if (!response.status.toString().startsWith('2')) {
            throw new Error(`Failed to send a Line Notify message: ${response.statusText}`);
        }

        console.log('Line Notify message was sent successfully!');
    } catch (err) {
        console.error(err);
    }
};
